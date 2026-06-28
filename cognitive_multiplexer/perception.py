"""Perception module: turns raw input into task and stakes signals."""

from __future__ import annotations

import re

from cognitive_multiplexer.models import PerceptionResult, StakeLevel


class PerceptionModule:
    def perceive(self, input_text: str) -> PerceptionResult:
        text = input_text.strip()
        lower = text.lower()
        task_type = self._task_type(lower)
        stakes = self._stakes(lower, task_type)
        entities = self._entities(text)
        constraints = self._constraints(text)
        uncertainty = self._uncertainty(lower)
        emotional_tone = self._tone(lower)
        tools = self._required_tools(lower, task_type)

        return PerceptionResult(
            task_type=task_type,
            goal=self._goal(text, task_type),
            entities=entities,
            constraints=constraints,
            uncertainty=uncertainty,
            emotional_tone=emotional_tone,
            required_tools=tools,
            estimated_stakes=stakes,
        )

    def _task_type(self, lower: str) -> str:
        if any(word in lower for word in ["python", "code", "function", "bug", "api", "class"]):
            return "coding"
        if any(word in lower for word in ["prove", "calculate", "equation", "probability"]):
            return "math"
        if any(word in lower for word in ["research", "latest", "source", "compare studies"]):
            return "research"
        if any(word in lower for word in ["plan", "decide", "strategy", "week", "roadmap"]):
            return "planning"
        if any(word in lower for word in ["apologize", "relationship", "tell my", "respond to"]):
            return "social"
        return "general"

    def _stakes(self, lower: str, task_type: str) -> StakeLevel:
        high_terms = ["quit my job", "medical", "legal", "financial", "invest", "safety", "lawsuit"]
        medium_terms = ["career", "company", "hire", "fire", "deadline", "budget", "production"]
        if any(term in lower for term in high_terms):
            return "high"
        if any(term in lower for term in medium_terms) or task_type in {"planning", "research"}:
            return "medium"
        return "low"

    def _entities(self, text: str) -> list[str]:
        capitalized = re.findall(r"\b[A-Z][a-zA-Z0-9_-]{2,}\b", text)
        quoted = re.findall(r"['\"]([^'\"]+)['\"]", text)
        return sorted(set(capitalized + quoted))

    def _constraints(self, text: str) -> list[str]:
        constraints: list[str] = []
        patterns = [
            r"without ([^.?!]+)",
            r"must ([^.?!]+)",
            r"should ([^.?!]+)",
            r"do not ([^.?!]+)",
            r"don't ([^.?!]+)",
        ]
        for pattern in patterns:
            constraints.extend(match.strip() for match in re.findall(pattern, text, flags=re.I))
        return constraints

    def _uncertainty(self, lower: str) -> list[str]:
        markers = ["maybe", "not sure", "uncertain", "whether", "should i", "could"]
        return [marker for marker in markers if marker in lower]

    def _tone(self, lower: str) -> str | None:
        if any(word in lower for word in ["stressed", "anxious", "afraid", "worried"]):
            return "anxious"
        if any(word in lower for word in ["excited", "curious", "inspired"]):
            return "positive"
        if any(word in lower for word in ["angry", "frustrated", "upset"]):
            return "frustrated"
        return None

    def _required_tools(self, lower: str, task_type: str) -> list[str]:
        tools: list[str] = []
        if task_type == "research" or "latest" in lower:
            tools.append("web_search")
        if task_type == "coding":
            tools.append("code_execution")
        if "calendar" in lower or "schedule" in lower:
            tools.append("calendar")
        return tools

    def _goal(self, text: str, task_type: str) -> str:
        cleaned = re.sub(r"\s+", " ", text).strip()
        return f"Handle a {task_type} request: {cleaned}"
