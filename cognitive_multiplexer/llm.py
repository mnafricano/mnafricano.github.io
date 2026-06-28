"""LLM client boundary.

The prototype runs fully with MockLLMClient. If OPENAI_API_KEY is present,
OpenAIClient can be used without changing controller code.
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
from abc import ABC, abstractmethod


class LLMClient(ABC):
    @abstractmethod
    def complete(self, prompt: str, system: str | None = None) -> str:
        """Return a completion for the prompt."""


class MockLLMClient(LLMClient):
    def complete(self, prompt: str, system: str | None = None) -> str:
        lower = prompt.lower()
        if "panini" in lower:
            return (
                "To make a good panini, start with sturdy bread such as ciabatta, focaccia, or sourdough. "
                "Brush the outside lightly with olive oil or butter, then layer cheese plus fillings like turkey, "
                "ham, tomato, basil, roasted vegetables, or pesto. Heat a panini press, grill pan, or skillet over "
                "medium heat. Cook the sandwich for 3 to 5 minutes per side, pressing it gently, until the bread is "
                "crisp and the cheese has melted. Let it rest for a minute, then slice it while warm."
            )
        if "deduplicate" in lower and "dictionary" in lower:
            return (
                "Use a dictionary keyed by id to keep one record per id. "
                "Preserve insertion order by assigning into a dict as you scan."
            )
        if "quit" in lower and ("job" in lower or "company" in lower):
            return (
                "Treat this as a reversible planning problem: define runway, "
                "validate demand, reduce downside, and decide only after testing assumptions."
            )
        if "plan my week" in lower:
            return (
                "Start with fixed commitments, choose three outcomes, reserve focus blocks, "
                "then review capacity before adding optional work."
            )
        how_to_match = re.search(r"\bhow (?:do i|to|can i|should i) ([^?]+)", lower)
        if how_to_match:
            action = how_to_match.group(1).strip()
            return (
                f"Here is a practical way to {action}: start with the desired outcome, gather the required materials "
                "or information, do the smallest workable first step, check the result, then refine. If timing or "
                "safety matters, slow down and verify each step before moving on."
            )
        if lower.startswith(("what is", "what are", "explain")):
            topic = re.sub(r"^(what is|what are|explain)\s+", "", lower).strip(" ?")
            return (
                f"{topic.capitalize()} can be understood by separating the basic definition, the key parts, "
                "and a concrete example. In simple terms, focus first on what it does, then why it matters, "
                "then where it can fail or be misunderstood."
            )
        return self._general_response(prompt)

    def _general_response(self, prompt: str) -> str:
        cleaned = prompt.strip().rstrip("?!.")
        return (
            f"Here is a useful response to '{cleaned}': identify the goal, note any constraints, choose a simple "
            "first action, and check whether the result matches what you wanted. If you share more context, I can "
            "make the answer more specific."
        )


class OpenAIClient(LLMClient):
    """Minimal OpenAI Responses API adapter.

    This intentionally uses the standard library so the project still installs
    and runs without adding an OpenAI SDK dependency.
    """

    def __init__(self, model: str | None = None, api_key: str | None = None) -> None:
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is required to use OpenAIClient.")
        self.model = model or os.getenv("COGNITIVE_MULTIPLEXER_MODEL", "gpt-4.1-mini")

    def complete(self, prompt: str, system: str | None = None) -> str:
        payload = {
            "model": self.model,
            "input": [
                {
                    "role": "system",
                    "content": system
                    or "You are a helpful expert contributing to a modular cognitive runtime. Answer clearly.",
                },
                {"role": "user", "content": prompt},
            ],
        }
        request = urllib.request.Request(
            "https://api.openai.com/v1/responses",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=45) as response:
            data = json.loads(response.read().decode("utf-8"))
        return self._extract_text(data)

    def _extract_text(self, data: dict) -> str:
        if data.get("output_text"):
            return str(data["output_text"])
        chunks: list[str] = []
        for item in data.get("output", []):
            for content in item.get("content", []):
                text = content.get("text")
                if text:
                    chunks.append(text)
        if chunks:
            return "\n".join(chunks)
        return json.dumps(data)


def default_llm_client() -> LLMClient:
    provider = os.getenv("COGNITIVE_MULTIPLEXER_LLM", "mock").lower()
    if provider == "openai":
        return OpenAIClient()
    return MockLLMClient()
