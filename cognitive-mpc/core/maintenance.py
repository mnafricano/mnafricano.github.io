"""Idle replay, consolidation, and rotating backup coordination."""

from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from .backups import BackupManager
from .config import SettingsStore
from .controller import CognitiveController
from .logging import StructuredLogger


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_time(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


class MaintenanceManager:
    """Run low-priority memory work only while the chat runtime is idle."""

    def __init__(
        self,
        *,
        path: Path | str,
        controller: CognitiveController,
        settings: SettingsStore,
        backups: BackupManager,
        cycle_lock: threading.RLock,
        logger: Optional[StructuredLogger] = None,
        poll_seconds: float = 30.0,
    ) -> None:
        self.path = Path(path)
        self.controller = controller
        self.settings = settings
        self.backups = backups
        self.cycle_lock = cycle_lock
        self.logger = logger
        self.poll_seconds = max(1.0, poll_seconds)
        self._state = self._load()
        self._last_activity = time.monotonic()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def _load(self) -> Dict[str, Any]:
        if not self.path.exists():
            return {
                "version": 1,
                "last_replay_at": "",
                "last_backup_at": "",
                "last_result": "never_run",
                "running": False,
            }
        with self.path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if not isinstance(payload, dict):
            raise ValueError("Maintenance state must be a JSON object.")
        payload["running"] = False
        return payload

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=self.path.parent, delete=False
        ) as handle:
            json.dump(self._state, handle, indent=2, sort_keys=True)
            handle.write("\n")
            temporary_name = handle.name
        os.replace(temporary_name, self.path)

    def note_activity(self) -> None:
        self._last_activity = time.monotonic()

    def status(self) -> Dict[str, Any]:
        idle_seconds = max(0.0, time.monotonic() - self._last_activity)
        return {
            **self._state,
            "idle_seconds": round(idle_seconds, 1),
            "replay_due": self._replay_due(),
            "backup_due": self._backup_due(),
        }

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(
            target=self._loop,
            name="cognitive-mpc-maintenance",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2.0)

    def _loop(self) -> None:
        while not self._stop.wait(self.poll_seconds):
            self.run_if_due()

    def _replay_due(self) -> bool:
        configured = self.settings.settings
        if not configured.replay_enabled:
            return False
        last = _parse_time(str(self._state.get("last_replay_at", "")))
        if last is None:
            return True
        return datetime.now(timezone.utc) - last >= timedelta(
            hours=configured.replay_interval_hours
        )

    def _backup_due(self) -> bool:
        if not self.settings.settings.backups_enabled:
            return False
        last = _parse_time(str(self._state.get("last_backup_at", "")))
        if last is None:
            return True
        return datetime.now(timezone.utc) - last >= timedelta(hours=24)

    def run_if_due(self, *, force: bool = False) -> Dict[str, Any]:
        idle_minutes = (time.monotonic() - self._last_activity) / 60
        required_idle = self.settings.settings.replay_idle_minutes
        due_replay = self._replay_due()
        due_backup = self._backup_due()
        if not force and due_replay and not due_backup and idle_minutes < required_idle:
            return {"ran": False, "reason": "not_idle"}
        if not force and not (due_replay or due_backup):
            return {"ran": False, "reason": "not_due"}
        if not self.cycle_lock.acquire(blocking=False):
            return {"ran": False, "reason": "chat_busy"}

        try:
            self._state["running"] = True
            self._save()
            result: Dict[str, Any] = {"ran": True}
            if (due_replay and (force or idle_minutes >= required_idle)) or force:
                replay = self.controller.replay.review(self.controller.memory)
                consolidated = self.controller.memory.consolidate()
                self.controller._promote_consolidated_beliefs(
                    consolidated.get("semantic", [])
                )
                self.controller._save()
                self._state["last_replay_at"] = utc_now()
                result["replay"] = replay.to_dict()
                result["consolidation"] = consolidated
                if self.logger:
                    self.logger.log(
                        "idle_replay",
                        {
                            "summary": replay.to_dict(),
                            "consolidation": consolidated,
                        },
                    )
            if due_backup or force:
                self.backups.retention = self.settings.settings.backup_retention
                backup = self.backups.create(reason="daily")
                self._state["last_backup_at"] = utc_now()
                result["backup"] = backup
                if self.logger:
                    self.logger.log("automatic_backup", backup)
            self._state["last_result"] = "success"
            return result
        except Exception as exc:
            self._state["last_result"] = f"{type(exc).__name__}: {exc}"
            if self.logger:
                self.logger.log(
                    "maintenance_error",
                    {"error": self._state["last_result"]},
                )
            return {"ran": False, "reason": "error", "error": str(exc)}
        finally:
            self._state["running"] = False
            self._save()
            self.cycle_lock.release()
