"""Transparent heuristic simulation for candidate plans."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List

from .planner import CandidatePlan
from .state import WorldState


def _clamp(value: float) -> float:
    return round(max(0.0, min(10.0, value)), 2)


@dataclass
class ScoringWeights:
    """Adjustable utility coefficients; defaults implement the requested formula."""

    benefit: float = 1.0
    compounding_value: float = 1.0
    reversibility: float = 1.0
    cost: float = 1.0
    risk: float = 1.0
    uncertainty: float = 1.0


@dataclass
class SimulationResult:
    plan_id: str
    likely_benefit: float
    likely_cost: float
    uncertainty: float
    risk: float
    reversibility: float
    compounding_value: float
    required_resources: List[str]
    explanations: Dict[str, str] = field(default_factory=dict)
    weights: ScoringWeights = field(default_factory=ScoringWeights)

    @property
    def score(self) -> float:
        """benefit + compounding + reversibility - cost - risk - uncertainty."""

        value = (
            self.weights.benefit * self.likely_benefit
            + self.weights.compounding_value * self.compounding_value
            + self.weights.reversibility * self.reversibility
            - self.weights.cost * self.likely_cost
            - self.weights.risk * self.risk
            - self.weights.uncertainty * self.uncertainty
        )
        return round(value, 2)

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["score"] = self.score
        return payload


class HeuristicWorldModel:
    """Estimate a plan trajectory from explicit structural signals."""

    def __init__(self, weights: ScoringWeights | None = None) -> None:
        self.weights = weights or ScoringWeights()

    def simulate(self, plan: CandidatePlan, state: WorldState) -> SimulationResult:
        step_count = len(plan.steps)
        feedback_steps = sum(bool(step.feedback_signal) for step in plan.steps)
        reversible_steps = sum(step.reversible for step in plan.steps)
        resources = sorted(
            {resource for step in plan.steps for resource in step.resources}
        )

        tag_set = set(plan.tags)
        benefit = 4.0 + min(2.0, feedback_steps * 0.55)
        benefit += 1.0 if {"practice", "experiment", "prototype"} & tag_set else 0.0
        benefit += 0.75 if "feedback" in tag_set else 0.0

        compounding = 3.5
        compounding += 2.0 if "compounding" in tag_set else 0.0
        compounding += 1.25 if "foundation" in tag_set else 0.0
        compounding += 0.75 if "feedback" in tag_set else 0.0

        total_effort = sum(step.estimated_effort for step in plan.steps)
        cost = 1.0 + (0.85 * total_effort) + (0.2 * len(resources))

        goal_uncertainty = (
            sum(state.uncertainty.values()) / len(state.uncertainty)
            if state.uncertainty
            else 0.5
        )
        uncertainty = 1.0 + (0.45 * len(plan.assumptions)) + (2.0 * goal_uncertainty)
        if "project" in tag_set or "architecture" in tag_set:
            uncertainty += 0.75

        risk = 0.75 + (0.8 * len(plan.predicted_risks))
        risk += 0.8 if "project" in tag_set else 0.0
        risk += sum(not step.reversible for step in plan.steps) * 1.5

        reversibility = (
            10.0 * reversible_steps / step_count if step_count else 0.0
        )
        if any("rollback" in step.description.casefold() for step in plan.steps):
            reversibility += 0.5

        return SimulationResult(
            plan_id=plan.id,
            likely_benefit=_clamp(benefit),
            likely_cost=_clamp(cost),
            uncertainty=_clamp(uncertainty),
            risk=_clamp(risk),
            reversibility=_clamp(reversibility),
            compounding_value=_clamp(compounding),
            required_resources=resources,
            explanations={
                "benefit": (
                    f"{feedback_steps}/{step_count} steps expose feedback; "
                    f"strategy tags: {', '.join(plan.tags) or 'none'}."
                ),
                "cost": (
                    f"{total_effort:.2f} estimated effort units across {step_count} "
                    f"steps and {len(resources)} resource types."
                ),
                "uncertainty": (
                    f"{len(plan.assumptions)} explicit assumptions; current mean state "
                    f"uncertainty is {goal_uncertainty:.2f}."
                ),
                "risk": f"{len(plan.predicted_risks)} predicted risks were declared.",
                "reversibility": (
                    f"{reversible_steps}/{step_count} steps are marked reversible."
                ),
                "compounding_value": (
                    "Foundation and feedback-loop tags increase reusable future value."
                ),
            },
            weights=self.weights,
        )
