from __future__ import annotations

import unittest

from core.llm import ModelStatus
from core.planner import HeuristicPlanner, OllamaPlannerBackend
from core.state import WorldState


def plan_payload():
    plans = []
    for index in range(3):
        plans.append(
            {
                "title": f"Strategy {index + 1}",
                "rationale": f"Distinct rationale {index + 1}.",
                "steps": [
                    {
                        "description": f"Run bounded experiment {index + 1}.",
                        "action_type": "experiment",
                        "prerequisites": [],
                        "resources": ["30 minutes"],
                        "feedback_signal": "A measurable result is recorded.",
                        "reversible": True,
                        "estimated_effort": 0.5,
                    },
                    {
                        "description": "Review the evidence.",
                        "action_type": "reflection",
                        "prerequisites": [],
                        "resources": ["notes"],
                        "feedback_signal": "A continue or revise decision exists.",
                        "reversible": True,
                        "estimated_effort": 0.25,
                    },
                ],
                "assumptions": ["A small experiment is possible."],
                "predicted_risks": ["The signal may be noisy."],
                "tags": ["experiment", f"route-{index}"],
            }
        )
    return {"plans": plans}


class FakePlannerModel:
    requested_model = "qwen3:8b"

    def __init__(self, payload=None, error=None):
        self.payload = payload
        self.error = error

    def structured(self, messages, schema, **options):
        if self.error:
            raise self.error
        return self.payload

    def status(self, *, force=False):
        return ModelStatus(True, "ollama", "qwen3:8b", "generative", "ready")


class OllamaPlannerBackendTests(unittest.TestCase):
    def test_structured_plans_parse_into_existing_schema(self) -> None:
        backend = OllamaPlannerBackend(FakePlannerModel(plan_payload()))
        plans = backend.generate("Build a routine.", WorldState())
        self.assertEqual(len(plans), 3)
        self.assertEqual(backend.last_metadata["source"], "ollama")
        self.assertTrue(all(plan.steps[0].feedback_signal for plan in plans))

    def test_malformed_output_falls_back_visibly(self) -> None:
        backend = OllamaPlannerBackend(
            FakePlannerModel({"plans": []}),
            fallback=HeuristicPlanner(),
        )
        plans = backend.generate("Learn networking fundamentals.", WorldState())
        self.assertEqual(len(plans), 3)
        self.assertEqual(backend.last_metadata["source"], "heuristic_fallback")
        self.assertIn("used deterministic", backend.last_metadata["warning"])

    def test_compact_wire_plans_expand_to_full_candidate_horizons(self) -> None:
        payload = {
            "plans": [
                {
                    "title": f"Alternative {index}",
                    "rationale": "Use a distinct bounded strategy.",
                    "first_action": f"Run experiment {index}.",
                    "feedback_signal": "A measurable result exists.",
                    "assumption": "The experiment is available.",
                    "risk": "The signal may be noisy.",
                    "tag": f"route-{index}",
                }
                for index in range(1, 4)
            ]
        }
        backend = OllamaPlannerBackend(FakePlannerModel(payload))
        plans = backend.generate("Build a routine.", WorldState())
        self.assertEqual(len(plans), 3)
        self.assertTrue(all(len(plan.steps) == 2 for plan in plans))
        self.assertTrue(all(plan.steps[1].action_type == "reflection" for plan in plans))


if __name__ == "__main__":
    unittest.main()
