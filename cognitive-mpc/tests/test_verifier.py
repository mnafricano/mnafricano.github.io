from __future__ import annotations

import unittest

from core.planner import CandidatePlan, PlanStep
from core.state import WorldState
from core.verifier import RuleBasedVerifier


class VerifierTests(unittest.TestCase):
    def test_disabled_shell_and_unsafe_action_fail(self) -> None:
        plan = CandidatePlan(
            id="plan_bad",
            title="Unsafe plan",
            rationale="Exercise verifier rules.",
            steps=[
                PlanStep(
                    id="step_1",
                    description="Delete production data and disable security immediately.",
                    action_type="tool:shell",
                    feedback_signal="Command returns.",
                )
            ],
            assumptions=["Shell is available."],
            predicted_risks=["Data loss."],
        )
        result = RuleBasedVerifier().verify(plan, WorldState())

        self.assertFalse(result.passed)
        self.assertTrue(any("shell" in error.casefold() for error in result.errors))
        self.assertTrue(any("unsafe" in error.casefold() for error in result.errors))

    def test_missing_feedback_and_resource_are_warnings(self) -> None:
        state = WorldState(
            environment_facts={"unavailable_resources": ["virtualization"]}
        )
        plan = CandidatePlan(
            id="plan_warn",
            title="Incomplete plan",
            rationale="Exercise warning rules.",
            steps=[
                PlanStep(
                    id="step_1",
                    description="Configure an isolated practice environment carefully.",
                    resources=["virtualization"],
                )
            ],
            assumptions=["Virtualization exists."],
            predicted_risks=["Setup delay."],
        )
        result = RuleBasedVerifier().verify(plan, state)

        self.assertTrue(result.passed)
        self.assertTrue(any("feedback" in warning for warning in result.warnings))
        self.assertTrue(any("unavailable" in warning for warning in result.warnings))


if __name__ == "__main__":
    unittest.main()
