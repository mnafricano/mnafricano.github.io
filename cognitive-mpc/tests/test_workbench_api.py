from __future__ import annotations

import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from core.llm import DisabledLanguageModel
from web_server import create_server


def request_json(base, path, *, method="GET", payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    request = Request(
        f"{base}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urlopen(request, timeout=5) as response:
        return json.load(response)


class WorkbenchApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.server = create_server(
            "127.0.0.1",
            0,
            state_path=self.root / "state.json",
            memory_path=self.root / "memory.json",
            log_path=self.root / "cycles.jsonl",
            history_path=self.root / "history.json",
            workspace=self.root,
            language_model=DisabledLanguageModel(),
            start_maintenance=False,
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)
        self.temporary.cleanup()

    def test_stream_contains_phase_tokens_and_complete(self):
        request = Request(
            f"{self.base}/api/chat/stream",
            data=json.dumps(
                {"message": "Build a cybersecurity learning routine.", "mode": "goal"}
            ).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=5) as response:
            stream = response.read().decode()
        for event in ("intent", "planning", "simulation", "verification", "selection", "token", "complete"):
            self.assertIn(f"event: {event}", stream)
        status = request_json(self.base, "/api/status")
        self.assertEqual(status["runtime"]["cycle_count"], 1)

    def test_settings_memory_backup_and_approval_endpoints(self):
        settings = request_json(self.base, "/api/settings")
        self.assertEqual(settings["model"], "qwen3:8b")
        updated = request_json(
            self.base,
            "/api/settings",
            method="PATCH",
            payload={"workspace_path": str(self.root), "shell_enabled": False},
        )
        self.assertEqual(Path(updated["workspace_path"]), self.root.resolve())

        request_json(
            self.base,
            "/api/chat",
            method="POST",
            payload={"message": "Learn networking fundamentals.", "mode": "goal"},
        )
        memories = request_json(self.base, "/api/memories")
        self.assertGreater(memories["count"], 0)
        memory_id = memories["memories"][0]["id"]
        request_json(
            self.base,
            f"/api/memories/{memory_id}",
            method="PATCH",
            payload={"pinned": True},
        )
        request_json(self.base, f"/api/memories/{memory_id}", method="DELETE")

        backup = request_json(self.base, "/api/backups", method="POST", payload={})
        self.assertTrue(backup["id"].startswith("backup-"))
        listed = request_json(self.base, "/api/backups")
        self.assertTrue(listed["backups"])

    def test_unknown_approval_cannot_execute(self):
        with self.assertRaises(HTTPError) as caught:
            request_json(
                self.base,
                "/api/approvals/not-real/approve",
                method="POST",
                payload={},
            )
        self.assertEqual(caught.exception.code, 400)

    def test_note_write_denial_then_exact_single_approval(self):
        first = request_json(
            self.base,
            "/api/chat",
            method="POST",
            payload={
                "message": "write note notes/approval.md: denied content",
                "mode": "command",
            },
        )
        approval = first["message"]["details"]["approval_requests"][0]
        request_json(
            self.base,
            f"/api/approvals/{approval['id']}/deny",
            method="POST",
            payload={},
        )
        self.assertFalse((self.root / "notes/approval.md").exists())

        second = request_json(
            self.base,
            "/api/chat",
            method="POST",
            payload={
                "message": "write note notes/approval.md: approved content",
                "mode": "command",
            },
        )
        approval = second["message"]["details"]["approval_requests"][0]
        executed = request_json(
            self.base,
            f"/api/approvals/{approval['id']}/approve",
            method="POST",
            payload={},
        )
        self.assertEqual(executed["status"], "executed")
        self.assertEqual(
            (self.root / "notes/approval.md").read_text().strip(),
            "approved content",
        )
        with self.assertRaises(HTTPError):
            request_json(
                self.base,
                f"/api/approvals/{approval['id']}/approve",
                method="POST",
                payload={},
            )
        self.assertEqual(
            (self.root / "notes/approval.md").read_text().strip(),
            "approved content",
        )


if __name__ == "__main__":
    unittest.main()
