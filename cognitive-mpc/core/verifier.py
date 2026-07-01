"""Rule-based safety and feasibility verification for candidate plans."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List

from .planner import CandidatePlan
from .state import WorldState


@dataclass
class VerificationResult:
    plan_id: str
    passed: bool
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    checks_run: List[str] = field(default_factory=list)

    @property
    def penalty(self) -> float:
        """A visible controller-side utility penalty."""

        return round((0.5 * len(self.warnings)) + (10.0 * len(self.errors)), 2)

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["penalty"] = self.penalty
        return payload


class RuleBasedVerifier:
    """Catch obvious problems without claiming formal proof."""

    UNSAFE_PHRASES = (
        "delete production",
        "disable security",
        "expose credentials",
        "run untrusted code without isolation",
        "attack a live system",
    )
    IMPOSSIBLE_PHRASES = ("guarantee zero risk", "instant mastery", "infinite resources")
    VAGUE_ACTIONS = {"learn more", "do research", "work on it", "improve things"}

    def verify(self, plan: CandidatePlan, state: WorldState) -> VerificationResult:
        warnings: List[str] = []
        errors: List[str] = []
        checks = [
            "plan structure",
            "action specificity",
            "feedback loop",
            "prerequisites and resources",
            "unsafe or impossible claims",
            "assumptions and contradictions",
        ]

        if not plan.steps:
            errors.append("Plan has no executable steps.")
        if not plan.assumptions:
            warnings.append("Plan declares no assumptions, so uncertainty is hidden.")
        if not plan.predicted_risks:
            warnings.append("Plan declares no risks.")

        seen_descriptions: set[str] = set()
        has_feedback = False
        unavailable = {
            str(item).casefold()
            for item in state.environment_facts.get("unavailable_resources", [])
        }
        shell_enabled = bool(state.environment_facts.get("shell_enabled", False))

        for index, step in enumerate(plan.steps, start=1):
            description = " ".join(step.description.split()).strip()
            lowered = description.casefold()
            if len(description.split()) < 5 or lowered in self.VAGUE_ACTIONS:
                warnings.append(f"Step {index} is too vague to verify: {description!r}.")
            if lowered in seen_descriptions:
                warnings.append(f"Step {index} duplicates an earlier action.")
            seen_descriptions.add(lowered)

            has_feedback = has_feedback or bool(step.feedback_signal.strip())
            if step.estimated_effort <= 0:
                errors.append(f"Step {index} has a non-positive effort estimate.")
            if not step.reversible and not any(
                term in lowered for term in ("backup", "rollback", "approval")
            ):
                warnings.append(
                    f"Step {index} is irreversible but has no backup, rollback, or approval."
                )

            if step.action_type == "tool:shell" and not shell_enabled:
                errors.append("Plan requires the shell tool, but shell execution is disabled.")

            for resource in step.resources:
                if resource.casefold() in unavailable:
                    warnings.append(
                        f"Step {index} assumes unavailable resource: {resource}."
                    )
            for prerequisite in step.prerequisites:
                if prerequisite.casefold().startswith("fact:"):
                    fact_name = prerequisite.split(":", 1)[1].strip()
                    if not state.environment_facts.get(fact_name):
                        warnings.append(
                            f"Step {index} requires missing state fact: {fact_name}."
                        )

            for phrase in self.UNSAFE_PHRASES:
                if phrase in lowered:
                    errors.append(f"Step {index} contains unsafe instruction: {phrase}.")
            for phrase in self.IMPOSSIBLE_PHRASES:
                if phrase in lowered:
                    errors.append(f"Step {index} makes an impossible claim: {phrase}.")

        if not has_feedback:
            warnings.append("Plan has no observable feedback loop.")

        combined = " ".join(step.description.casefold() for step in plan.steps)
        if "never use" in combined and "must use" in combined:
            warnings.append("Plan may contain contradictory tool-use requirements.")

        return VerificationResult(
            plan_id=plan.id,
            passed=not errors,
            warnings=list(dict.fromkeys(warnings)),
            errors=list(dict.fromkeys(errors)),
            checks_run=checks,
        )
