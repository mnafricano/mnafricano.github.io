"""Routes perceived tasks to expert modules."""

from __future__ import annotations

from cognitive_multiplexer.models import ExpertSelection, PerceptionResult, RoutingPlan
from cognitive_multiplexer.working_memory import WorkingMemory


class ExpertRouter:
    def route(self, perception: PerceptionResult, memory: WorkingMemory) -> RoutingPlan:
        selections: list[ExpertSelection] = []

        def add(name: str, reason: str, weight: float) -> None:
            if name not in {selection.name for selection in selections}:
                selections.append(ExpertSelection(name=name, reason=reason, weight=weight))

        add("GeneralReasoningExpert", "Every task needs baseline reasoning and synthesis.", 0.6)

        if perception.task_type == "planning":
            add("PlanningExpert", "Perception classified the request as planning/decision support.", 0.9)
        if perception.task_type == "coding":
            add("CodingExpert", "Perception found coding terms or implementation intent.", 0.95)
        if perception.task_type == "math":
            add("MathExpert", "Perception found mathematical language.", 0.9)
        if perception.task_type == "research" or "web_search" in perception.required_tools:
            add("ResearchExpert", "Request may require external/current factual support.", 0.85)
        if perception.task_type == "social" or perception.emotional_tone:
            add("SocialExpert", "Tone or content suggests interpersonal/emotional context.", 0.75)
        if perception.estimated_stakes in {"medium", "high"}:
            add("SafetyExpert", f"Estimated stakes are {perception.estimated_stakes}.", 0.85)

        add("VerificationExpert", "All outputs should pass a final verification channel.", 1.0)

        return RoutingPlan(
            selected_experts=selections,
            rationale="Experts selected from task type, required tools, emotional tone, working memory, and stakes.",
        )
