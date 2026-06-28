"""Expert modules that contribute separate cognitive perspectives."""

from __future__ import annotations

from cognitive_multiplexer.llm import LLMClient
from cognitive_multiplexer.models import PerceptionResult, RetrievedMemory
from cognitive_multiplexer.working_memory import WorkingMemory


class BaseExpert:
    name = "BaseExpert"

    def contribute(
        self,
        input_text: str,
        perception: PerceptionResult,
        memory: WorkingMemory,
        retrieved_memories: list[RetrievedMemory],
        llm: LLMClient,
    ) -> str:
        raise NotImplementedError


class GeneralReasoningExpert(BaseExpert):
    name = "GeneralReasoningExpert"

    def contribute(self, input_text, perception, memory, retrieved_memories, llm):
        return llm.complete(input_text, system="Give a clear general reasoning response.")


class PlanningExpert(BaseExpert):
    name = "PlanningExpert"

    def contribute(self, input_text, perception, memory, retrieved_memories, llm):
        return (
            "Planning frame: define the decision, list constraints, identify reversible tests, "
            "set a review date, and choose the next smallest action."
        )


class CodingExpert(BaseExpert):
    name = "CodingExpert"

    def contribute(self, input_text, perception, memory, retrieved_memories, llm):
        if "deduplicate" in input_text.lower() and "id" in input_text.lower():
            return (
                "```python\n"
                "from collections.abc import Iterable\n\n"
                "def dedupe_dicts_by_id(items: Iterable[dict]) -> list[dict]:\n"
                "    \"\"\"Return one dictionary per id, keeping the last item for duplicate ids.\"\"\"\n"
                "    by_id = {}\n"
                "    for item in items:\n"
                "        if \"id\" not in item:\n"
                "            raise KeyError(\"Each item must contain an 'id' key\")\n"
                "        by_id[item[\"id\"]] = item\n"
                "    return list(by_id.values())\n"
                "```\n"
                "This runs in O(n) time and preserves the first-seen key order while keeping the latest value."
            )
        return llm.complete(input_text, system="Produce concise, correct Python-oriented help.")


class MathExpert(BaseExpert):
    name = "MathExpert"

    def contribute(self, input_text, perception, memory, retrieved_memories, llm):
        return "Math frame: define variables, state assumptions, solve step by step, then check units and edge cases."


class ResearchExpert(BaseExpert):
    name = "ResearchExpert"

    def contribute(self, input_text, perception, memory, retrieved_memories, llm):
        return "Research frame: separate known facts from claims that need sources; use current sources before concluding."


class SocialExpert(BaseExpert):
    name = "SocialExpert"

    def contribute(self, input_text, perception, memory, retrieved_memories, llm):
        return "Social frame: acknowledge emotion, preserve agency, avoid mind-reading, and suggest a respectful next message."


class SafetyExpert(BaseExpert):
    name = "SafetyExpert"

    def contribute(self, input_text, perception, memory, retrieved_memories, llm):
        if perception.estimated_stakes == "high":
            return (
                "Safety frame: avoid overconfident advice, identify irreversible harms, "
                "recommend expert support when legal, medical, financial, or major career risk is present."
            )
        return "Safety frame: check for obvious misuse, harm, or overclaiming."


class VerificationExpert(BaseExpert):
    name = "VerificationExpert"

    def contribute(self, input_text, perception, memory, retrieved_memories, llm):
        return "Verification frame: test factual support, consistency, assumptions, instructions, and need for clarification."


EXPERT_REGISTRY: dict[str, type[BaseExpert]] = {
    expert.name: expert
    for expert in [
        GeneralReasoningExpert,
        PlanningExpert,
        CodingExpert,
        MathExpert,
        ResearchExpert,
        SocialExpert,
        SafetyExpert,
        VerificationExpert,
    ]
}
