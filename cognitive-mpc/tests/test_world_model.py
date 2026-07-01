from __future__ import annotations

import unittest

from core.planner import HeuristicPlanner
from core.state import WorldState
from core.world_model import HeuristicWorldModel


class WorldModelTests(unittest.TestCase):
    def test_visible_score_matches_documented_formula(self) -> None:
        state = WorldState()
        goal = state.add_goal("Learn networking fundamentals.")
        plan = HeuristicPlanner().generate(goal.text, state)[0]
        result = HeuristicWorldModel().simulate(plan, state)

        expected = round(
            result.likely_benefit
            + result.compounding_value
            + result.reversibility
            - result.likely_cost
            - result.risk
            - result.uncertainty,
            2,
        )
        self.assertEqual(result.score, expected)
        self.assertTrue(result.required_resources)
        self.assertIn("benefit", result.explanations)


if __name__ == "__main__":
    unittest.main()
