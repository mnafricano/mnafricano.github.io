"""Verification channel for candidate evaluation and selection."""

from __future__ import annotations

from cognitive_multiplexer.models import Candidate, PerceptionResult, VerificationDecision, VerificationReport
from cognitive_multiplexer.working_memory import WorkingMemory


class Verifier:
    def verify(
        self,
        input_text: str,
        perception: PerceptionResult,
        memory: WorkingMemory,
        candidates: list[Candidate],
    ) -> VerificationDecision:
        reports = [self._score_candidate(input_text, perception, candidate) for candidate in candidates]
        for report in reports:
            memory.add_verification_note(f"{report.candidate_id}: {report.score} - {'; '.join(report.critique_notes)}")

        best = max(reports, key=lambda report: report.score)
        selected = next(candidate for candidate in candidates if candidate.id == best.candidate_id)
        final = self._polish_final(selected.content, perception, best)
        return VerificationDecision(
            selected_candidate_id=selected.id,
            action="select",
            final_answer=final,
            reports=reports,
        )

    def _score_candidate(self, input_text: str, perception: PerceptionResult, candidate: Candidate) -> VerificationReport:
        content = candidate.content.lower()
        score = 75
        notes: list[str] = []
        missing: list[str] = []

        if perception.task_type == "coding" and "```python" in content:
            score += 12
            notes.append("Includes concrete Python code.")
        if perception.estimated_stakes == "high" and any(word in content for word in ["threshold", "runway", "professional"]):
            score += 10
            notes.append("High-stakes answer includes caution and decision criteria.")
        if perception.estimated_stakes == "high" and candidate.kind == "cautious":
            score += 3
            notes.append("Cautious candidate preferred for high-stakes decisions.")
        if perception.estimated_stakes == "high" and candidate.kind == "direct":
            score -= 2
            notes.append("Direct framing is less appropriate for high-stakes decisions.")
        if perception.task_type == "research" and "source" not in content:
            score -= 15
            missing.append("Current sources may be required.")
        if "always" in content or "guarantee" in content:
            score -= 10
            notes.append("Contains potentially overconfident wording.")
        if not content.strip():
            score = 0
            notes.append("Empty candidate.")
        if perception.constraints and not all(constraint.lower()[:12] in content for constraint in perception.constraints):
            missing.append("Some extracted constraints may need explicit handling.")
            score -= 5

        return VerificationReport(
            candidate_id=candidate.id,
            score=max(0, min(100, score)),
            factual_support="Supported by internal reasoning and retrieved memories; external facts not fetched in mock mode.",
            internal_consistency="No obvious contradictions detected." if score >= 60 else "Candidate needs revision.",
            missing_assumptions=missing,
            safety_risk="Elevated; answer should remain cautious." if perception.estimated_stakes == "high" else "Low obvious safety risk.",
            instruction_following="Addresses the perceived task type and goal.",
            should_ask_clarifying_question=perception.estimated_stakes == "high" and "whether" in input_text.lower(),
            critique_notes=notes or ["Adequate candidate for prototype runtime."],
        )

    def _polish_final(self, content: str, perception: PerceptionResult, report: VerificationReport) -> str:
        if report.should_ask_clarifying_question and perception.estimated_stakes == "high":
            return (
                content
                + "\n\nBefore treating this as a final decision, clarify your runway, obligations, risk tolerance, "
                "and evidence of demand. I can help turn those into a decision matrix."
            )
        return content
