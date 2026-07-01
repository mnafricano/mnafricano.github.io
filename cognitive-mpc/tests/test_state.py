from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from core.state import WorldState


class WorldStateTests(unittest.TestCase):
    def test_state_round_trip_preserves_goal_task_observation_and_belief(self) -> None:
        state = WorldState()
        goal = state.add_goal("Learn networking fundamentals.")
        task = state.add_task(goal.id, "Map the TCP/IP layers.", "plan_foundation")
        state.resolve_task(task.id, "Completed successfully.", "success")
        state.record_observation(
            "Completed successfully.",
            outcome="success",
            related_task_id=task.id,
        )
        state.environment_facts["available_minutes"] = 45
        state.update_belief("pref:labs", "The user prefers practical labs.", 0.2)

        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "state.json"
            state.save(path)
            loaded = WorldState.load(path)

        self.assertEqual(loaded.user_goals[0].text, goal.text)
        self.assertEqual(loaded.active_tasks[0].status, "completed")
        self.assertEqual(loaded.recent_observations[0].outcome, "success")
        self.assertEqual(loaded.environment_facts["available_minutes"], 45)
        self.assertIn("pref:labs", loaded.long_term_beliefs)

    def test_empty_goal_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            WorldState().add_goal("   ")


if __name__ == "__main__":
    unittest.main()
