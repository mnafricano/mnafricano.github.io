from __future__ import annotations

import unittest

from core.planner import HeuristicPlanner
from core.state import WorldState


class PlannerTests(unittest.TestCase):
    def test_learning_goal_produces_three_structured_alternatives(self) -> None:
        plans = HeuristicPlanner().generate(
            "Learn networking fundamentals for cybersecurity.",
            WorldState(),
        )

        self.assertGreaterEqual(len(plans), 3)
        self.assertEqual(len({plan.id for plan in plans}), len(plans))
        self.assertTrue(all(plan.steps for plan in plans))
        self.assertTrue(all(plan.assumptions for plan in plans))
        self.assertTrue(all(plan.predicted_risks for plan in plans))
        self.assertTrue(
            all(step.feedback_signal for plan in plans for step in plan.steps)
        )

    def test_memory_context_explicitly_nudges_practice_plan(self) -> None:
        plans = HeuristicPlanner().generate(
            "Build a cybersecurity learning routine.",
            WorldState(),
            ["User prefers hands-on practical work."],
        )
        practice_plans = [plan for plan in plans if "practice" in plan.tags]
        self.assertTrue(
            any("remembered preference" in plan.rationale for plan in practice_plans)
        )


if __name__ == "__main__":
    unittest.main()
