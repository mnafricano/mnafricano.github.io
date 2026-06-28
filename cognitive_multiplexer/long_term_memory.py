"""Simple local memory store with keyword retrieval and write gating."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from cognitive_multiplexer.models import MemoryRecord, MemoryType, PerceptionResult, RetrievedMemory


class LongTermMemory:
    def __init__(self, path: str | Path = ".cognitive_multiplexer_memory.json") -> None:
        self.path = Path(path)
        self.records: list[MemoryRecord] = []
        self._load()

    def add(self, record: MemoryRecord) -> None:
        self.records.append(record)
        self._save()

    def retrieve(
        self,
        query: str,
        *,
        memory_type: MemoryType | None = None,
        tags: list[str] | None = None,
        limit: int = 5,
    ) -> list[RetrievedMemory]:
        query_terms = self._terms(query)
        tag_set = set(tags or [])
        scored: list[RetrievedMemory] = []
        now = datetime.now(timezone.utc)

        for record in self.records:
            if memory_type and record.type != memory_type:
                continue
            if tag_set and not tag_set.intersection(record.tags):
                continue

            text_terms = self._terms(record.text + " " + " ".join(record.tags))
            overlap = len(query_terms.intersection(text_terms))
            age_days = max((now - record.timestamp).days, 0)
            recency = 1 / (1 + age_days / 30)
            score = overlap + (0.35 * recency) + (0.5 * record.confidence)
            if overlap or tag_set.intersection(record.tags):
                scored.append(RetrievedMemory(record=record, score=round(score, 3), reason="keyword/recency match"))

        return sorted(scored, key=lambda item: item.score, reverse=True)[:limit]

    def should_write(self, input_text: str, answer: str, perception: PerceptionResult) -> bool:
        lower = input_text.lower()
        if "remember" in lower or "my preference" in lower:
            return True
        if perception.task_type == "coding":
            return False
        if perception.estimated_stakes == "high":
            return False
        return False

    def build_memory(self, input_text: str, answer: str, perception: PerceptionResult) -> MemoryRecord:
        text = f"User asked: {input_text}. System answered: {answer[:500]}"
        memory_type: MemoryType = "preference" if "preference" in input_text.lower() else "episodic"
        return MemoryRecord(
            text=text,
            type=memory_type,
            source="cognitive_cycle",
            confidence=0.65,
            tags=[perception.task_type, perception.estimated_stakes],
        )

    def _load(self) -> None:
        if not self.path.exists():
            return
        data = json.loads(self.path.read_text(encoding="utf-8"))
        self.records = [MemoryRecord.model_validate(item) for item in data]

    def _save(self) -> None:
        self.path.write_text(
            json.dumps([record.model_dump(mode="json") for record in self.records], indent=2),
            encoding="utf-8",
        )

    def _terms(self, text: str) -> set[str]:
        return {term for term in re.findall(r"[a-z0-9_]{3,}", text.lower())}
