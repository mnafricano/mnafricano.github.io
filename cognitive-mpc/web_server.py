#!/usr/bin/env python3
"""Local HTTP/SSE server for the Cognitive MPC workbench."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import threading
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Optional, Sequence
from urllib.parse import parse_qs, unquote, urlparse

from core.approvals import ApprovalStore
from core.backups import BackupManager
from core.chat import ChatStore, CognitiveChatRuntime
from core.config import DataMigrator, RuntimePaths, SettingsStore
from core.controller import CognitiveController
from core.intent import IntentRouter
from core.llm import LanguageModel, OllamaLanguageModel
from core.logging import StructuredLogger
from core.maintenance import MaintenanceManager
from core.memory import MemoryStore
from core.planner import HeuristicPlanner, OllamaPlannerBackend
from core.state import WorldState


PROJECT_ROOT = Path(__file__).resolve().parent
WEB_ROOT = PROJECT_ROOT / "web"
APP_VERSION = "1.0.0"


class WorkbenchServices:
    """Mutable application services shared by HTTP request threads."""

    def __init__(
        self,
        *,
        paths: RuntimePaths,
        runtime: CognitiveChatRuntime,
        settings: SettingsStore,
        approvals: ApprovalStore,
        backups: BackupManager,
        maintenance: MaintenanceManager,
        migration: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.paths = paths
        self.runtime = runtime
        self.settings = settings
        self.approvals = approvals
        self.backups = backups
        self.maintenance = maintenance
        self.migration = migration or {
            "version": 1,
            "status": "not_required",
            "copied": [],
        }

    def apply_settings(self, changes: Dict[str, Any]) -> Dict[str, Any]:
        proposed_workspace = str(
            changes.get("workspace_path", self.settings.settings.workspace_path)
        ).strip()
        workspace = proposed_workspace or None
        if workspace:
            candidate = Path(workspace).expanduser()
            if not candidate.is_dir():
                raise ValueError("The selected workspace must be an existing folder.")
            changes = {**changes, "workspace_path": str(candidate.resolve())}
        configured = self.settings.update(changes)
        self.runtime.controller.tools.configure(
            workspace=workspace,
            shell_enabled=configured.shell_enabled,
            read_enabled=configured.auto_read_enabled,
            note_enabled=configured.note_writer_enabled,
        )
        self.runtime.controller.state.environment_facts.update(
            {
                "shell_enabled": configured.shell_enabled,
                "workspace_path": configured.workspace_path,
            }
        )
        model = self.runtime.language_model
        if isinstance(model, OllamaLanguageModel):
            normalized = configured.ollama_url.rstrip("/")
            model.api_root = (
                normalized if normalized.endswith("/api") else f"{normalized}/api"
            )
            model.requested_model = configured.model
            model._cached_status = None
        self.backups.retention = configured.backup_retention
        return configured.to_dict()

    def status(self) -> Dict[str, Any]:
        payload = self.runtime.status()
        payload["settings"] = self.settings.settings.to_dict()
        payload["maintenance"] = self.maintenance.status()
        payload["migration"] = self.migration
        payload["schemas"] = {
            "state": self.runtime.controller.state.version,
            "memory": 1,
            "history": self.runtime.store.version,
            "settings": self.settings.settings.version,
            "approvals": 1,
        }
        payload["pending_approvals"] = len(self.approvals.list("pending"))
        return payload

    def reload_after_restore(self) -> None:
        self.runtime.controller.state = WorldState.load(self.paths.state)
        self.runtime.controller.memory = MemoryStore.load(self.paths.memory)
        self.runtime.store = ChatStore.load(self.paths.history)
        self.settings.settings = self.settings.load()
        self.approvals.requests = self.approvals._load()
        self.apply_settings({})


class CognitiveMPCRequestHandler(BaseHTTPRequestHandler):
    """Serve static assets and a same-origin local workbench API."""

    services: WorkbenchServices
    web_root: Path = WEB_ROOT
    server_version = f"CognitiveMPC/{APP_VERSION}"

    @property
    def runtime(self) -> CognitiveChatRuntime:
        return self.services.runtime

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        try:
            if path == "/api/health":
                model = self.runtime.language_model.status(force=True)
                self._send_json(
                    {
                        "ok": True,
                        "service": "cognitive-mpc",
                        "version": APP_VERSION,
                        "model": model.to_dict(),
                        "scheduler": self.services.maintenance.status(),
                        "migration": self.services.migration,
                        "workspace": self.services.settings.settings.workspace_path,
                        "schemas": self.services.status()["schemas"],
                    }
                )
            elif path == "/api/status":
                self._send_json(self.services.status())
            elif path == "/api/settings":
                self._send_json(self.services.settings.settings.to_dict())
            elif path == "/api/memories":
                self._send_json(self._list_memories(query))
            elif path == "/api/approvals":
                status = query.get("status", [None])[0]
                self._send_json(
                    {"approvals": self.services.approvals.list(status=status)}
                )
            elif path == "/api/backups":
                self._send_json({"backups": self.services.backups.list()})
            elif path == "/api/backups/export":
                self._send_json(self.services.backups.export_bundle())
            else:
                self._serve_static(path)
        except (ValueError, OSError, json.JSONDecodeError) as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def do_PATCH(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            payload = self._read_json()
            if path == "/api/settings":
                self._send_json(self.services.apply_settings(payload))
                return
            if path.startswith("/api/memories/"):
                memory_id = unquote(path.rsplit("/", 1)[-1])
                pinned = bool(payload.get("pinned", False))
                record = self.runtime.controller.memory.set_pinned(memory_id, pinned)
                self.runtime.controller.memory.save(self.services.paths.memory)
                self._send_json({"memory": record.to_dict()})
                return
            self._send_json({"error": "API endpoint not found."}, HTTPStatus.NOT_FOUND)
        except (ValueError, OSError, json.JSONDecodeError) as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def do_DELETE(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            if path.startswith("/api/memories/"):
                memory_id = unquote(path.rsplit("/", 1)[-1])
                if not self.runtime.controller.memory.delete(memory_id):
                    self._send_json(
                        {"error": "Memory not found."}, HTTPStatus.NOT_FOUND
                    )
                    return
                self.runtime.controller.memory.save(self.services.paths.memory)
                self._send_json({"deleted": memory_id})
                return
            self._send_json({"error": "API endpoint not found."}, HTTPStatus.NOT_FOUND)
        except (ValueError, OSError) as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            payload = self._read_json()
            if path == "/api/chat":
                self._send_json(
                    self.runtime.send(
                        str(payload.get("message", "")),
                        str(payload.get("mode", "auto")),
                    )
                )
            elif path == "/api/chat/stream":
                self._stream_chat(payload)
            elif path == "/api/conversations":
                self._send_json(self.runtime.new_conversation(), HTTPStatus.CREATED)
            elif path == "/api/conversations/select":
                self._send_json(
                    self.runtime.switch_conversation(
                        str(payload.get("conversation_id", ""))
                    )
                )
            elif path == "/api/backups":
                backup = self.services.backups.create(reason="manual")
                self._send_json(backup, HTTPStatus.CREATED)
            elif path.startswith("/api/backups/") and path.endswith("/restore"):
                backup_id = unquote(path.split("/")[-2])
                restored = self.services.backups.restore(backup_id)
                self.services.reload_after_restore()
                self._send_json(restored)
            elif path.startswith("/api/approvals/") and path.endswith("/approve"):
                approval_id = unquote(path.split("/")[-2])
                self._send_json(self.services.approvals.approve(approval_id))
            elif path.startswith("/api/approvals/") and path.endswith("/deny"):
                approval_id = unquote(path.split("/")[-2])
                self._send_json(self.services.approvals.deny(approval_id))
            elif path == "/api/maintenance/run":
                self._send_json(self.services.maintenance.run_if_due(force=True))
            else:
                self._send_json(
                    {"error": "API endpoint not found."}, HTTPStatus.NOT_FOUND
                )
        except (ValueError, FileNotFoundError, json.JSONDecodeError) as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            self._send_json(
                {"error": f"{type(exc).__name__}: {exc}"},
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def _stream_chat(self, payload: Dict[str, Any]) -> None:
        text = str(payload.get("message", ""))
        mode = str(payload.get("mode", "auto"))
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()
        try:
            conversation = self.runtime.store.active_conversation()
            goal = self.runtime._conversation_goal(conversation)
            pending = (
                self.runtime.controller.state.latest_pending_task(goal.id)
                if goal
                else None
            )
            intent = self.runtime.intent_router.route(
                text,
                has_pending_action=pending is not None,
                override=mode,
            )
            self._sse("intent", intent.to_dict())
            if intent.intent in {"goal", "observation"} and not intent.needs_confirmation:
                for phase in ("planning", "simulation", "verification", "selection"):
                    self._sse(phase, {"status": "running"})
            result = self.runtime.send(text, mode)
            message = result["message"]
            for approval in message.get("details", {}).get(
                "approval_requests", []
            ):
                self._sse("approval_required", approval)
            content = str(message.get("content", ""))
            for start in range(0, len(content), 12):
                self._sse("token", {"content": content[start : start + 12]})
            self._sse("complete", result)
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as exc:
            self._sse(
                "error",
                {
                    "error": f"{type(exc).__name__}: {exc}",
                    "recoverable": True,
                },
            )

    def _sse(self, event: str, payload: Dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False)
        self.wfile.write(f"event: {event}\ndata: {encoded}\n\n".encode("utf-8"))
        self.wfile.flush()

    def _list_memories(self, query: Dict[str, Any]) -> Dict[str, Any]:
        search = str(query.get("q", [""])[0])
        kind = str(query.get("kind", [""])[0])
        records = (
            self.runtime.controller.memory.search(
                search,
                kinds=[kind] if kind else None,
                limit=500,
            )
            if search
            else self.runtime.controller.memory.all_records
        )
        if kind:
            records = [record for record in records if record.kind == kind]
        pinned = query.get("pinned", [""])[0]
        if pinned in {"true", "false"}:
            expected = pinned == "true"
            records = [
                record
                for record in records
                if bool(record.metadata.get("pinned", False)) == expected
            ]
        return {
            "memories": [record.to_dict() for record in reversed(records[-500:])],
            "count": len(records),
        }

    def _read_json(self) -> Dict[str, Any]:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("Invalid Content-Length header.") from exc
        if content_length <= 0:
            return {}
        if content_length > 256_000:
            raise ValueError("Request body exceeds 256 KB.")
        payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("JSON request body must be an object.")
        return payload

    def _serve_static(self, requested_path: str) -> None:
        relative = (
            "index.html" if requested_path == "/" else unquote(requested_path.lstrip("/"))
        )
        root = self.web_root.resolve()
        target = (root / relative).resolve()
        if target != root and root not in target.parents:
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        if not target.is_file():
            if "." not in Path(relative).name:
                target = root / "index.html"
            else:
                self.send_error(HTTPStatus.NOT_FOUND)
                return
        content = target.read_bytes()
        media_type, _ = mimetypes.guess_type(target.name)
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", media_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; style-src 'self'; script-src 'self'",
        )
        self.end_headers()
        self.wfile.write(content)

    def _send_json(
        self,
        payload: Dict[str, Any],
        status: HTTPStatus = HTTPStatus.OK,
    ) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        try:
            self.wfile.write(encoded)
        except (BrokenPipeError, ConnectionResetError):
            return

    def log_message(self, format: str, *args: Any) -> None:
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(format, *args)


class WorkbenchHTTPServer(ThreadingHTTPServer):
    services: WorkbenchServices

    def server_close(self) -> None:
        self.services.maintenance.stop()
        super().server_close()


def _paths_from_explicit(
    state_path: Path | str,
    memory_path: Path | str,
    log_path: Path | str,
    history_path: Path | str,
) -> RuntimePaths:
    state = Path(state_path)
    data_dir = state.parent
    log = Path(log_path)
    return RuntimePaths(
        data_dir=data_dir,
        log_dir=log.parent,
        state=state,
        memory=Path(memory_path),
        history=Path(history_path),
        settings=data_dir / "settings.json",
        approvals=data_dir / "approvals.json",
        maintenance=data_dir / "maintenance.json",
        migration=data_dir / "migration.json",
        backups=data_dir / "backups",
        log=log,
    )


def create_server(
    host: str,
    port: int,
    *,
    state_path: Path | str,
    memory_path: Path | str,
    log_path: Path | str,
    history_path: Path | str,
    workspace: Optional[Path | str] = None,
    enable_shell: bool = False,
    enable_note_writer: bool = False,
    language_model: Optional[LanguageModel] = None,
    ollama_url: Optional[str] = None,
    model: Optional[str] = None,
    model_timeout: float = 90.0,
    runtime_paths: Optional[RuntimePaths] = None,
    migration: Optional[Dict[str, Any]] = None,
    start_maintenance: bool = True,
) -> WorkbenchHTTPServer:
    paths = runtime_paths or _paths_from_explicit(
        state_path, memory_path, log_path, history_path
    )
    paths.ensure_directories()
    settings = SettingsStore(paths.settings)
    if workspace is not None and not settings.settings.workspace_path:
        settings.update({"workspace_path": str(Path(workspace).resolve())})
    if enable_shell or enable_note_writer:
        settings.update(
            {
                "shell_enabled": enable_shell,
                "note_writer_enabled": enable_note_writer,
            }
        )
    configured = settings.settings
    local_model = language_model or OllamaLanguageModel(
        base_url=ollama_url or configured.ollama_url,
        model=model or configured.model,
        timeout=model_timeout,
    )
    logger = StructuredLogger(paths.log)
    planner = (
        OllamaPlannerBackend(local_model, fallback=HeuristicPlanner(), logger=logger)
        if isinstance(local_model, OllamaLanguageModel)
        else HeuristicPlanner()
    )
    controller = CognitiveController.from_paths(
        paths.state,
        paths.memory,
        paths.log,
        workspace=configured.workspace_path or None,
        enable_shell=configured.shell_enabled,
        enable_note_writer=configured.note_writer_enabled,
        planner=planner,
    )
    controller.tools.configure(
        workspace=configured.workspace_path or None,
        shell_enabled=configured.shell_enabled,
        read_enabled=configured.auto_read_enabled,
        note_enabled=configured.note_writer_enabled,
    )
    approvals = ApprovalStore(paths.approvals, controller.tools, logger)
    runtime = CognitiveChatRuntime(
        controller,
        paths.history,
        language_model=local_model,
        intent_router=IntentRouter(
            local_model if isinstance(local_model, OllamaLanguageModel) else None
        ),
        approvals=approvals,
        settings=settings,
    )
    backups = BackupManager(paths, configured.backup_retention)
    maintenance = MaintenanceManager(
        path=paths.maintenance,
        controller=controller,
        settings=settings,
        backups=backups,
        cycle_lock=runtime._lock,
        logger=logger,
    )
    runtime.activity_callback = maintenance.note_activity
    services = WorkbenchServices(
        paths=paths,
        runtime=runtime,
        settings=settings,
        approvals=approvals,
        backups=backups,
        maintenance=maintenance,
        migration=migration,
    )

    class BoundHandler(CognitiveMPCRequestHandler):
        pass

    BoundHandler.services = services
    BoundHandler.web_root = WEB_ROOT
    server = WorkbenchHTTPServer((host, port), BoundHandler)
    server.services = services
    if start_maintenance:
        maintenance.start()
    return server


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the Cognitive MPC workbench.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8787, type=int)
    parser.add_argument("--no-open", action="store_true")
    parser.add_argument(
        "--project-data",
        action="store_true",
        help="Use repository data paths instead of macOS Application Support.",
    )
    parser.add_argument("--state", type=Path)
    parser.add_argument("--memory", type=Path)
    parser.add_argument("--history", type=Path)
    parser.add_argument("--log", type=Path)
    parser.add_argument("--enable-shell", action="store_true")
    parser.add_argument("--enable-note-writer", action="store_true")
    parser.add_argument(
        "--ollama-url",
        default=os.environ.get("OLLAMA_HOST"),
    )
    parser.add_argument("--model", default=os.environ.get("COGNITIVE_MPC_MODEL"))
    parser.add_argument("--model-timeout", type=float, default=240.0)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    explicit = any((args.state, args.memory, args.history, args.log))
    if args.project_data or explicit:
        paths = RuntimePaths.project_local(PROJECT_ROOT)
        migration = {"status": "project_data", "copied": []}
    else:
        paths = RuntimePaths.app_support()
        migration = DataMigrator(PROJECT_ROOT, paths).migrate()
    if args.state:
        paths = _paths_from_explicit(
            args.state,
            args.memory or paths.memory,
            args.log or paths.log,
            args.history or paths.history,
        )
    server = create_server(
        args.host,
        args.port,
        state_path=paths.state,
        memory_path=paths.memory,
        log_path=paths.log,
        history_path=paths.history,
        enable_shell=args.enable_shell,
        enable_note_writer=args.enable_note_writer,
        ollama_url=args.ollama_url,
        model=args.model,
        model_timeout=args.model_timeout,
        runtime_paths=paths,
        migration=migration,
    )
    actual_port = server.server_address[1]
    url = f"http://{args.host}:{actual_port}"
    print("Cognitive MPC Workbench")
    print(f"Open {url}")
    print(f"Data: {paths.data_dir}")
    status = server.services.runtime.language_model.status()
    print(
        f"Model: {status.provider}/{status.model}"
        if status.available
        else f"Model unavailable: {status.detail}"
    )
    print("Press Ctrl+C to stop.")
    if not args.no_open:
        threading.Timer(0.35, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Cognitive MPC Workbench.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
