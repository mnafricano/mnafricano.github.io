from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from core.controller import CognitiveController
from core.logging import StructuredLogger
from core.memory import MemoryStore
from core.scheduler import CognitiveScheduler, SchedulerConfig
from core.state import WorldState


class ControllerTests(unittest.TestCase):
    def test_controller_persists_decision_then_replans_after_observation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            state_path = root / "state.json"
            memory_path = root / "memory.json"
            log_path = root / "cycles.jsonl"
            controller = CognitiveController(
                state=WorldState(),
                memory=MemoryStore(),
                scheduler=CognitiveScheduler(
                    SchedulerConfig(
                        consolidation_interval=2,
                        replay_interval=2,
                        minimum_episodes_for_consolidation=1,
                    )
                ),
                logger=StructuredLogger(log_path),
                state_path=state_path,
                memory_path=memory_path,
            )
            goal = "Build a cybersecurity learning routine."

            first = controller.run_cycle(goal)
            second = controller.run_cycle(
                goal,
                "The first action succeeded; the practical lab format worked.",
            )

            self.assertGreaterEqual(len(first.candidates), 3)
            self.assertTrue(first.decision.step.description)
            self.assertNotEqual(
                first.decision.step.description,
                second.decision.step.description,
            )
            self.assertEqual(second.observation_outcome, "success")
            self.assertTrue(state_path.exists())
            self.assertTrue(memory_path.exists())
            self.assertIsNotNone(second.memory_update["replay_memory_id"])

            cycle_logs = [
                event
                for event in StructuredLogger(log_path).read()
                if event["event_type"] == "control_cycle"
            ]
            self.assertEqual(len(cycle_logs), 2)
            self.assertIn("candidate_plans", cycle_logs[-1])
            self.assertIn("selected_action", cycle_logs[-1])
            self.assertIn("memory_update", cycle_logs[-1])

    def test_controller_refuses_to_advance_without_observation(self) -> None:
        controller = CognitiveController(state=WorldState(), memory=MemoryStore())
        goal = "Learn Linux commands."
        controller.run_cycle(goal)
        with self.assertRaises(ValueError):
            controller.run_cycle(goal)


if __name__ == "__main__":
    unittest.main()
