"""Mutable state for a cognitive session."""

from __future__ import annotations

from cognitive_multiplexer.models import Candidate, WorkingMemorySummary


class WorkingMemory:
    def __init__(self, session_id: str | None = None) -> None:
        self.session_id = session_id or "default"
        self.active_goal: str | None = None
        self.important_constraints: list[str] = []
        self.known_facts: list[str] = []
        self.open_questions: list[str] = []
        self.intermediate_hypotheses: list[str] = []
        self.tool_results: list[str] = []
        self.candidate_answers: list[Candidate] = []
        self.verification_notes: list[str] = []

    def add_fact(self, fact: str) -> None:
        self._append_unique(self.known_facts, fact)

    def add_constraint(self, constraint: str) -> None:
        self._append_unique(self.important_constraints, constraint)

    def add_open_question(self, question: str) -> None:
        self._append_unique(self.open_questions, question)

    def add_candidate(self, candidate: Candidate) -> None:
        self.candidate_answers.append(candidate)

    def add_verification_note(self, note: str) -> None:
        self.verification_notes.append(note)

    def summarize(self) -> WorkingMemorySummary:
        return WorkingMemorySummary(
            active_goal=self.active_goal,
            important_constraints=list(self.important_constraints),
            known_facts=list(self.known_facts),
            open_questions=list(self.open_questions),
            intermediate_hypotheses=list(self.intermediate_hypotheses),
            tool_results=list(self.tool_results),
            candidate_count=len(self.candidate_answers),
            verification_notes=list(self.verification_notes),
        )

    def _append_unique(self, target: list[str], value: str) -> None:
        cleaned = value.strip()
        if cleaned and cleaned not in target:
            target.append(cleaned)
