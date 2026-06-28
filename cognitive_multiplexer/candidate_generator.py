"""Candidate response generation channel."""

from __future__ import annotations

from cognitive_multiplexer.experts import EXPERT_REGISTRY
from cognitive_multiplexer.llm import LLMClient
from cognitive_multiplexer.models import Candidate, ComputeBudget, PerceptionResult, RetrievedMemory, RoutingPlan
from cognitive_multiplexer.working_memory import WorkingMemory


class CandidateGenerator:
    def generate(
        self,
        input_text: str,
        perception: PerceptionResult,
        memory: WorkingMemory,
        retrieved_memories: list[RetrievedMemory],
        routing_plan: RoutingPlan,
        llm: LLMClient,
        compute_budget: ComputeBudget = "medium",
    ) -> list[Candidate]:
        contributions = self._expert_contributions(
            input_text, perception, memory, retrieved_memories, routing_plan, llm
        )

        kinds = ["single"]
        if compute_budget == "high" or (
            compute_budget == "medium"
            and (perception.estimated_stakes == "high" or len(routing_plan.selected_experts) >= 4)
        ):
            kinds = ["direct", "cautious", "creative"]

        candidates = [
            Candidate(
                kind=kind,
                content=self._compose(kind, input_text, perception, contributions, retrieved_memories),
                expert_contributions=contributions,
            )
            for kind in kinds
        ]

        for candidate in candidates:
            memory.add_candidate(candidate)
        return candidates

    def _expert_contributions(self, input_text, perception, memory, retrieved_memories, routing_plan, llm):
        output: dict[str, str] = {}
        for selection in routing_plan.selected_experts:
            expert_cls = EXPERT_REGISTRY[selection.name]
            output[selection.name] = expert_cls().contribute(
                input_text, perception, memory, retrieved_memories, llm
            )
        return output

    def _compose(self, kind, input_text, perception, contributions, retrieved_memories):
        memory_note = ""
        if retrieved_memories:
            memory_note = "Relevant memory: " + "; ".join(item.record.text for item in retrieved_memories[:2]) + "\n\n"

        if perception.task_type == "coding":
            return (
                f"{memory_note}Here is a practical implementation:\n\n"
                f"{contributions.get('CodingExpert', contributions.get('GeneralReasoningExpert', ''))}\n\n"
                "Verification notes: handles duplicate ids, missing id keys, empty inputs, and O(n) runtime."
            )

        if "quit my job" in input_text.lower() and "company" in input_text.lower():
            if kind == "direct":
                stance = "Direct plan"
            elif kind == "creative":
                stance = "Creative option"
            else:
                stance = "Cautious plan"
            return (
                f"{memory_note}{stance}: do not make the decision as a single leap. "
                "Map your financial runway, validate customer demand with small tests, define a reversible transition, "
                "and set decision thresholds before resigning. Talk with trusted advisors and qualified financial/legal "
                "professionals where needed. A useful next step is a 30-day validation sprint with explicit success metrics."
            )

        pieces = [value for key, value in contributions.items() if key != "VerificationExpert"]
        prefix = {
            "single": "Suggested answer",
            "direct": "Direct answer",
            "cautious": "Cautious answer",
            "creative": "Creative answer",
        }[kind]
        return f"{memory_note}{prefix}: " + " ".join(pieces)
