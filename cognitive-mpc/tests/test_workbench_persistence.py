from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from core.approvals import ApprovalStore
from core.backups import BackupManager
from core.config import DataMigrator, RuntimePaths, SettingsStore
from core.logging import StructuredLogger
from core.memory import MemoryStore
from core.state import WorldState
from core.tools import ToolRegistry


class WorkbenchPersistenceTests(unittest.TestCase):
    def test_settings_are_versioned_and_workspace_is_not_implicit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            store = SettingsStore(Path(temporary) / "settings.json")
            self.assertEqual(store.settings.model, "qwen3:8b")
            self.assertEqual(store.settings.workspace_path, "")
            updated = store.update({"shell_enabled": True, "backup_retention": 3})
            self.assertTrue(updated.shell_enabled)
            self.assertEqual(SettingsStore(store.path).settings.backup_retention, 3)

    def test_approval_is_exact_single_use_and_expiry_is_persisted(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            registry = ToolRegistry(
                root,
                permissions={"write_notes": True},
            )
            store = ApprovalStore(root / "approvals.json", registry)
            request = store.create(
                conversation_id="chat_1",
                cycle_number=1,
                tool_name="note_writer",
                arguments={"path": "notes/test.md", "content": "exact"},
                rationale="test",
            )
            executed = store.approve(request["id"])
            self.assertEqual(executed["status"], "executed")
            self.assertEqual((root / "notes/test.md").read_text().strip(), "exact")
            with self.assertRaisesRegex(ValueError, "already executed"):
                store.approve(request["id"])
            self.assertEqual((root / "notes/test.md").read_text().strip(), "exact")

            expired = store.create(
                conversation_id="chat_1",
                cycle_number=1,
                tool_name="note_writer",
                arguments={"path": "notes/expired.md", "content": "never"},
                rationale="test",
            )
            record = store.get(expired["id"])
            record.expires_at = (
                datetime.now(timezone.utc) - timedelta(seconds=1)
            ).isoformat()
            with self.assertRaisesRegex(ValueError, "expired"):
                store.approve(record.id)
            reloaded = ApprovalStore(root / "approvals.json", registry)
            self.assertEqual(reloaded.get(record.id).status, "expired")
            self.assertFalse((root / "notes/expired.md").exists())

    def test_workspace_escape_is_never_executed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            registry = ToolRegistry(root, permissions={"write_notes": True})
            result = registry.call(
                "note_writer",
                {"path": "../escape.md", "content": "no"},
            )
            self.assertFalse(result.success)
            self.assertIn("escapes", result.error)
            self.assertFalse((root.parent / "escape.md").exists())

    def test_backup_restore_validates_and_recovers_data(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            paths = RuntimePaths.project_local(temporary)
            paths.ensure_directories()
            state = WorldState()
            state.add_goal("Original goal")
            state.save(paths.state)
            MemoryStore().save(paths.memory)
            SettingsStore(paths.settings)
            manager = BackupManager(paths, retention=2)
            backup = manager.create()
            WorldState().save(paths.state)
            restored = manager.restore(backup["id"])
            self.assertEqual(WorldState.load(paths.state).user_goals[0].text, "Original goal")
            self.assertTrue(restored["safety_backup"].startswith("backup-"))

    def test_copy_only_migration_records_counts(self) -> None:
        with tempfile.TemporaryDirectory() as source_dir, tempfile.TemporaryDirectory() as home:
            source = Path(source_dir)
            data = source / "data"
            data.mkdir()
            state = WorldState()
            state.add_goal("Migrated goal")
            state.save(data / "world_state.json")
            memory = MemoryStore()
            memory.add_episodic("Migrated episode")
            memory.save(data / "memory.json")
            destination = RuntimePaths.app_support(Path(home))
            record = DataMigrator(source, destination).migrate()
            self.assertTrue((data / "world_state.json").exists())
            self.assertEqual(record["status"], "completed")
            self.assertEqual(
                record["validation"]["memory.json"]["record_counts"]["episodic"],
                1,
            )
            self.assertEqual(
                WorldState.load(destination.state).user_goals[0].text,
                "Migrated goal",
            )


if __name__ == "__main__":
    unittest.main()
