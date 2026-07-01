from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from core.logging import StructuredLogger
from core.memory import MemoryStore
from core.replay import MemoryReplay
from core.scheduler import CognitiveProcess, CognitiveScheduler


class SchedulerReplayLoggingTests(unittest.TestCase):
    def test_scheduler_queues_foreground_and_due_maintenance_processes(self) -> None:
        scheduled = CognitiveScheduler().schedule(
            12,
            observation_outcome="failure",
            episodic_count=8,
        )
        processes = [item.process for item in scheduled]

        self.assertEqual(processes[0], CognitiveProcess.PLANNING)
        self.assertEqual(processes[1], CognitiveProcess.VERIFICATION)
        self.assertIn(CognitiveProcess.REFLECTION, processes)
        self.assertIn(CognitiveProcess.CONSOLIDATION, processes)
        self.assertIn(CognitiveProcess.REPLAY, processes)
        self.assertEqual(
            processes,
            sorted(
                processes,
                key=lambda process: next(
                    item.priority for item in scheduled if item.process == process
                ),
                reverse=True,
            ),
        )

    def test_replay_answers_required_questions_and_saves_summary(self) -> None:
        memory = MemoryStore()
        memory.add_episodic(
            "The sandbox failed unexpectedly.",
            tags=["experiment"],
            metadata={
                "outcome": "failure",
                "surprise": 0.9,
                "pattern_key": "sandbox:setup",
            },
        )
        memory.add_episodic(
            "The smaller sandbox setup succeeded.",
            tags=["experiment"],
            metadata={
                "outcome": "success",
                "surprise": 0.1,
                "pattern_key": "sandbox:setup",
            },
        )

        summary = MemoryReplay().review(memory)

        self.assertTrue(summary.surprises)
        self.assertTrue(summary.failures)
        self.assertTrue(summary.successes)
        self.assertIn("sandbox:setup", summary.pattern_to_store)
        self.assertIn("prerequisites", summary.future_strategy_change)
        saved = next(item for item in memory.episodic if item.id == summary.memory_id)
        self.assertIn("replay", saved.tags)

    def test_structured_logger_enforces_and_persists_cycle_schema(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            logger = StructuredLogger(Path(temporary) / "cycles.jsonl")
            with self.assertRaises(ValueError):
                logger.log_cycle({"goal": "missing fields"})

            logger.log_cycle(
                {
                    "goal": {"text": "Test the loop."},
                    "state_snapshot": {"cycle_count": 1},
                    "candidate_plans": [{"id": "plan_a"}],
                    "simulations": [{"plan_id": "plan_a", "score": 1.0}],
                    "verification": [{"plan_id": "plan_a", "warnings": []}],
                    "selected_action": {"description": "Run one test."},
                    "memory_update": {"decision_memory_id": "mem_1"},
                }
            )
            event = logger.read()[0]

        self.assertEqual(event["event_type"], "control_cycle")
        self.assertEqual(event["candidate_plans"][0]["id"], "plan_a")
        self.assertIn("timestamp", event)


if __name__ == "__main__":
    unittest.main()
