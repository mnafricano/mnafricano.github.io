"""Intent routing for goals, observations, questions, and tool commands."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional

from .llm import OllamaLanguageModel


VALID_INTENTS = {"goal", "observation", "question", "command"}


@dataclass(frozen=True)
class IntentDecision:
    intent: str
    confidence: float
    rationale: str
    source: str
    needs_confirmation: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class IntentRouter:
    """Use a deterministic classifier first, with optional structured AI help."""

    SCHEMA: Dict[str, Any] = {
        "type": "object",
        "properties": {
            "intent": {"type": "string", "enum": sorted(VALID_INTENTS)},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "rationale": {"type": "string"},
        },
        "required": ["intent", "confidence", "rationale"],
        "additionalProperties": False,
    }
    COMMAND_PATTERNS = (
        r"^(calculate|compute|read|open|inspect|write|save|append|run|execute)\b",
        r"^(use|call)\s+(the\s+)?(calculator|file|note|shell)\b",
    )
    OBSERVATION_PATTERNS = (
        r"^(done|finished|completed|it worked|it failed|failed|blocked|result[:\s])\b",
        r"^(i|we)\s+(did|tried|completed|finished|couldn't|cannot|was able)\b",
    )
    GOAL_PATTERNS = (
        r"^(i want|i need|help me|my goal|build|create|learn|plan|design|develop)\b",
    )

    def __init__(self, language_model: Optional[OllamaLanguageModel] = None) -> None:
        self.language_model = language_model

    def route(
        self,
        text: str,
        *,
        has_pending_action: bool,
        override: str = "auto",
    ) -> IntentDecision:
        clean = " ".join(text.split()).strip()
        requested = override.casefold().strip()
        if requested in VALID_INTENTS:
            return IntentDecision(
                intent=requested,
                confidence=1.0,
                rationale="The user selected this mode explicitly.",
                source="manual",
            )

        heuristic = self._heuristic(clean, has_pending_action)
        if heuristic.confidence >= 0.9 or self.language_model is None:
            return heuristic
        try:
            if not self.language_model.status().available:
                return heuristic
            payload = self.language_model.structured(
                [
                    {
                        "role": "system",
                        "content": (
                            "Classify one message for a local agent. A goal asks the "
                            "agent to pursue an outcome. An observation reports what "
                            "happened after the pending action. A question asks for "
                            "information without claiming action completion. A command "
                            "requests a calculator, file read/write, or shell operation."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Pending action exists: {has_pending_action}\n"
                            f"Message: {clean}"
                        ),
                    },
                ],
                self.SCHEMA,
                temperature=0.0,
                num_predict=180,
            )
            intent = str(payload.get("intent", "")).casefold()
            confidence = max(0.0, min(1.0, float(payload.get("confidence", 0))))
            if intent not in VALID_INTENTS:
                raise ValueError("Unknown model intent.")
            return IntentDecision(
                intent=intent,
                confidence=confidence,
                rationale=str(payload.get("rationale", "")).strip(),
                source="ollama",
                needs_confirmation=confidence < 0.7,
            )
        except (RuntimeError, TypeError, ValueError):
            return heuristic

    def _heuristic(self, text: str, has_pending_action: bool) -> IntentDecision:
        lowered = text.casefold()
        if any(re.search(pattern, lowered) for pattern in self.COMMAND_PATTERNS):
            return IntentDecision(
                "command", 0.93, "The message explicitly requests a tool action.", "rules"
            )
        if lowered.endswith("?") or re.match(
            r"^(what|why|how|when|where|who|which|can you explain|tell me)\b",
            lowered,
        ):
            return IntentDecision(
                "question", 0.91, "The message is phrased as a question.", "rules"
            )
        if has_pending_action and any(
            re.search(pattern, lowered) for pattern in self.OBSERVATION_PATTERNS
        ):
            return IntentDecision(
                "observation",
                0.94,
                "The message reports a result for the pending action.",
                "rules",
            )
        if has_pending_action and any(
            marker in lowered
            for marker in (
                "succeeded",
                "worked",
                "completed",
                "finished",
                "failed",
                "blocked",
                "result",
            )
        ):
            return IntentDecision(
                "observation",
                0.92,
                "The message contains an outcome marker for the pending action.",
                "rules",
            )
        if any(re.search(pattern, lowered) for pattern in self.GOAL_PATTERNS):
            return IntentDecision(
                "goal", 0.9, "The message requests a new outcome.", "rules"
            )
        if has_pending_action:
            return IntentDecision(
                "observation",
                0.66,
                "A pending action exists, but the message is ambiguous.",
                "rules",
                needs_confirmation=True,
            )
        return IntentDecision(
            "goal",
            0.72,
            "No pending action exists, so the message is treated as a goal.",
            "rules",
        )
