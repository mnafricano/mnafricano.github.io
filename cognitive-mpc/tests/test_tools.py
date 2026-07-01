from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from core.tools import ToolRegistry


class ToolRegistryTests(unittest.TestCase):
    def test_tools_are_real_logged_and_permission_gated(self) -> None:
        audit_events = []

        def audit(event_type, payload):
            audit_events.append((event_type, payload))

        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            registry = ToolRegistry(workspace, audit_callback=audit)

            calculation = registry.call(
                "calculator",
                {"expression": "(12 + 8) / 4"},
            )
            denied_note = registry.call(
                "note_writer",
                {"path": "notes/test.md", "content": "Evidence."},
            )
            denied_shell = registry.call(
                "shell",
                {"command": ["echo", "should-not-run"]},
            )

            self.assertTrue(calculation.success)
            self.assertEqual(calculation.output, "5.0")
            self.assertFalse(denied_note.allowed)
            self.assertFalse(denied_shell.allowed)
            self.assertFalse((workspace / "notes" / "test.md").exists())
            self.assertEqual(len(audit_events), 3)
            self.assertTrue(
                all(event_type == "tool_call" for event_type, _ in audit_events)
            )

    def test_authorized_note_and_reader_remain_inside_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            registry = ToolRegistry(
                workspace,
                permissions={"write_notes": True},
            )

            written = registry.call(
                "note_writer",
                {"path": "notes/evidence.md", "content": "Stored locally."},
            )
            read = registry.call(
                "file_reader",
                {"path": "notes/evidence.md"},
            )
            escaped = registry.call(
                "file_reader",
                {"path": "../outside.txt"},
            )

            self.assertTrue(written.success)
            self.assertTrue(read.success)
            self.assertEqual(read.output.strip(), "Stored locally.")
            self.assertFalse(escaped.success)
            self.assertIn("escapes", escaped.error)


if __name__ == "__main__":
    unittest.main()
