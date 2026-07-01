from __future__ import annotations

import tempfile
import threading
import unittest
from pathlib import Path

from core.backups import BackupManager
from core.config import RuntimePaths, SettingsStore
from core.controller import CognitiveController
from core.maintenance import MaintenanceManager
from core.memory import MemoryStore
from core.state import WorldState


class MaintenanceManagerTests(unittest.TestCase):
    def test_force_run_replays_consolidates_and_backs_up(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            paths = RuntimePaths.project_local(temporary)
            paths.ensure_directories()
            memory = MemoryStore()
            for _ in range(3):
                memory.add_episodic(
                    "A practical lab succeeded.",
                    metadata={
                        "pattern_key": "lab-success",
                        "semantic_summary": "Practical labs produce useful feedback.",
                        "procedural_candidate": "Start with a bounded practical lab.",
                        "outcome": "success",
                    },
                )
            controller = CognitiveController(
                state=WorldState(),
                memory=memory,
                state_path=paths.state,
                memory_path=paths.memory,
            )
            settings = SettingsStore(paths.settings)
            manager = MaintenanceManager(
                path=paths.maintenance,
                controller=controller,
                settings=settings,
                backups=BackupManager(paths),
                cycle_lock=threading.RLock(),
                poll_seconds=60,
            )
            result = manager.run_if_due(force=True)
            self.assertTrue(result["ran"])
            self.assertTrue(result["consolidation"]["semantic"])
            self.assertTrue(result["consolidation"]["procedural"])
            self.assertTrue(paths.maintenance.exists())
            self.assertTrue(list(paths.backups.glob("backup-*.zip")))

    def test_maintenance_never_overlaps_busy_chat_lock(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            paths = RuntimePaths.project_local(temporary)
            paths.ensure_directories()
            lock = threading.RLock()
            controller = CognitiveController(
                state=WorldState(),
                memory=MemoryStore(),
                state_path=paths.state,
                memory_path=paths.memory,
            )
            manager = MaintenanceManager(
                path=paths.maintenance,
                controller=controller,
                settings=SettingsStore(paths.settings),
                backups=BackupManager(paths),
                cycle_lock=lock,
            )
            ready = threading.Event()
            release = threading.Event()

            def hold_lock():
                with lock:
                    ready.set()
                    release.wait(2)

            thread = threading.Thread(target=hold_lock)
            thread.start()
            ready.wait(1)
            try:
                self.assertEqual(
                    manager.run_if_due(force=True)["reason"],
                    "chat_busy",
                )
            finally:
                release.set()
                thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
