"""Orchestrates the full cognitive cycle."""

from __future__ import annotations

from collections import defaultdict

from cognitive_multiplexer.candidate_generator import CandidateGenerator
from cognitive_multiplexer.expert_router import ExpertRouter
from cognitive_multiplexer.llm import LLMClient, default_llm_client
from cognitive_multiplexer.long_term_memory import LongTermMemory
from cognitive_multiplexer.models import CognitiveResult, CognitiveTrace, ComputeBudget, MemoryRecord
from cognitive_multiplexer.perception import PerceptionModule
from cognitive_multiplexer.verifier import Verifier
from cognitive_multiplexer.working_memory import WorkingMemory


class CognitiveController:
    def __init__(
        self,
        *,
        llm: LLMClient | None = None,
        long_term_memory: LongTermMemory | None = None,
    ) -> None:
        self.llm = llm or default_llm_client()
        self.long_term_memory = long_term_memory or LongTermMemory()
        self.perception = PerceptionModule()
        self.router = ExpertRouter()
        self.generator = CandidateGenerator()
        self.verifier = Verifier()
        self.sessions: dict[str, WorkingMemory] = defaultdict(WorkingMemory)

    def run(
        self,
        input_text: str,
        session_id: str | None = None,
        compute_budget: ComputeBudget = "medium",
    ) -> CognitiveResult:
        sid = session_id or "default"
        if sid not in self.sessions:
            self.sessions[sid] = WorkingMemory(session_id=sid)
        working_memory = self.sessions[sid]

        perception = self.perception.perceive(input_text)
        working_memory.active_goal = perception.goal
        working_memory.add_fact(f"User input: {input_text}")
        for constraint in perception.constraints:
            working_memory.add_constraint(constraint)
        for uncertainty in perception.uncertainty:
            working_memory.add_open_question(f"Clarify uncertainty marker: {uncertainty}")

        retrieved = self.long_term_memory.retrieve(
            perception.goal,
            tags=[perception.task_type, perception.estimated_stakes],
        )
        for item in retrieved:
            working_memory.add_fact(f"Retrieved memory: {item.record.text}")

        routing_plan = self.router.route(perception, working_memory)
        candidates = self.generator.generate(
            input_text,
            perception,
            working_memory,
            retrieved,
            routing_plan,
            self.llm,
            compute_budget,
        )
        decision = self.verifier.verify(input_text, perception, working_memory, candidates)

        written_memory: MemoryRecord | None = None
        memory_written = self.long_term_memory.should_write(input_text, decision.final_answer, perception)
        if memory_written:
            written_memory = self.long_term_memory.build_memory(input_text, decision.final_answer, perception)
            self.long_term_memory.add(written_memory)

        trace = CognitiveTrace(
            compute_budget=compute_budget,
            perception=perception,
            retrieved_memories=retrieved,
            routing_plan=routing_plan,
            working_memory_summary=working_memory.summarize(),
            candidate_summaries=[
                {
                    "id": candidate.id,
                    "kind": candidate.kind,
                    "preview": candidate.content[:240],
                    "experts": list(candidate.expert_contributions.keys()),
                }
                for candidate in candidates
            ],
            verification_scores=decision.reports,
            final_selected_answer=decision.final_answer,
            memory_written=memory_written,
            written_memory=written_memory,
        )
        return CognitiveResult(answer=decision.final_answer, trace=trace)
