"""Local episodic, semantic, and procedural memory with consolidation."""

from __future__ import annotations

import json
import os
import re
import tempfile
import uuid
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence


MEMORY_KINDS = ("episodic", "semantic", "procedural")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tokens(text: str) -> set[str]:
    """Tokenize without third-party NLP dependencies."""

    return {
        token
        for token in re.findall(r"[a-z0-9]+", text.casefold())
        if len(token) > 1
    }


@dataclass
class MemoryRecord:
    """One durable memory with provenance."""

    id: str
    kind: str
    content: str
    timestamp: str = field(default_factory=utc_now)
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    importance: float = 0.5
    source_episode_ids: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def create(
        cls,
        kind: str,
        content: str,
        tags: Optional[Iterable[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        importance: float = 0.5,
        source_episode_ids: Optional[Iterable[str]] = None,
    ) -> "MemoryRecord":
        if kind not in MEMORY_KINDS:
            raise ValueError(f"Unsupported memory kind: {kind}")
        clean_content = " ".join(content.split()).strip()
        if not clean_content:
            raise ValueError("Memory content cannot be empty.")
        return cls(
            id=f"mem_{uuid.uuid4().hex[:12]}",
            kind=kind,
            content=clean_content,
            tags=sorted(set(tags or [])),
            metadata=dict(metadata or {}),
            importance=max(0.0, min(1.0, importance)),
            source_episode_ids=list(source_episode_ids or []),
        )


class MemoryStore:
    """A small JSON-backed memory store designed for easy inspection."""

    def __init__(
        self,
        episodic: Optional[List[MemoryRecord]] = None,
        semantic: Optional[List[MemoryRecord]] = None,
        procedural: Optional[List[MemoryRecord]] = None,
    ) -> None:
        self.episodic = episodic or []
        self.semantic = semantic or []
        self.procedural = procedural or []

    @property
    def all_records(self) -> List[MemoryRecord]:
        return [*self.episodic, *self.semantic, *self.procedural]

    def get(self, memory_id: str) -> Optional[MemoryRecord]:
        return next(
            (record for record in self.all_records if record.id == memory_id),
            None,
        )

    def delete(self, memory_id: str) -> bool:
        """Delete one exact memory record without cascading through provenance."""

        for kind in MEMORY_KINDS:
            records: List[MemoryRecord] = getattr(self, kind)
            for index, record in enumerate(records):
                if record.id == memory_id:
                    del records[index]
                    return True
        return False

    def set_pinned(self, memory_id: str, pinned: bool) -> MemoryRecord:
        record = self.get(memory_id)
        if record is None:
            raise ValueError("Memory not found.")
        record.metadata["pinned"] = bool(pinned)
        return record

    def add(
        self,
        kind: str,
        content: str,
        *,
        tags: Optional[Iterable[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        importance: float = 0.5,
        source_episode_ids: Optional[Iterable[str]] = None,
    ) -> MemoryRecord:
        record = MemoryRecord.create(
            kind,
            content,
            tags,
            metadata,
            importance,
            source_episode_ids,
        )
        getattr(self, kind).append(record)
        return record

    def add_episodic(self, content: str, **kwargs: Any) -> MemoryRecord:
        return self.add("episodic", content, **kwargs)

    def add_semantic(self, content: str, **kwargs: Any) -> MemoryRecord:
        return self.add("semantic", content, **kwargs)

    def add_procedural(self, content: str, **kwargs: Any) -> MemoryRecord:
        return self.add("procedural", content, **kwargs)

    def search(
        self,
        query: str,
        *,
        kinds: Optional[Sequence[str]] = None,
        limit: int = 5,
    ) -> List[MemoryRecord]:
        """Return memories ranked by lexical overlap, tags, and importance."""

        allowed = set(kinds or MEMORY_KINDS)
        query_tokens = _tokens(query)
        ranked: List[tuple[float, MemoryRecord]] = []
        for record in self.all_records:
            if record.kind not in allowed:
                continue
            content_tokens = _tokens(record.content)
            tag_tokens = _tokens(" ".join(record.tags))
            if query_tokens:
                overlap = len(query_tokens & content_tokens) / len(query_tokens)
                tag_overlap = len(query_tokens & tag_tokens) / len(query_tokens)
            else:
                overlap = tag_overlap = 0.0
            score = overlap + (0.5 * tag_overlap) + (0.2 * record.importance)
            if score > 0.0:
                ranked.append((score, record))
        ranked.sort(
            key=lambda item: (
                bool(item[1].metadata.get("pinned", False)),
                item[0],
                item[1].timestamp,
            ),
            reverse=True,
        )
        return [record for _, record in ranked[:limit]]

    def consolidate(self, min_repetitions: int = 3) -> Dict[str, List[str]]:
        """Crystallize recurring episodes into reusable knowledge.

        Producers can supply ``pattern_key`` and ``semantic_summary`` metadata.
        When no key is supplied, exact normalized event text becomes the simple
        recurrence detector. A ``procedural_candidate`` turns a repeated,
        successful strategy into a procedural memory as well.
        """

        groups: Dict[str, List[MemoryRecord]] = defaultdict(list)
        for episode in self.episodic:
            pattern_key = str(
                episode.metadata.get(
                    "pattern_key",
                    re.sub(r"\s+", " ", episode.content.casefold()).strip(),
                )
            )
            groups[pattern_key].append(episode)

        created: Dict[str, List[str]] = {"semantic": [], "procedural": []}
        existing_sources = {
            source_id
            for record in [*self.semantic, *self.procedural]
            for source_id in record.source_episode_ids
        }

        for pattern_key, episodes in groups.items():
            if len(episodes) < min_repetitions:
                continue
            unconsolidated = [ep for ep in episodes if ep.id not in existing_sources]
            if not unconsolidated:
                continue

            source_ids = [episode.id for episode in episodes]
            latest = episodes[-1]
            semantic_summary = str(
                latest.metadata.get(
                    "semantic_summary",
                    f"Recurring pattern ({len(episodes)} observations): {latest.content}",
                )
            )
            semantic = self.add_semantic(
                semantic_summary,
                tags={"consolidated", *latest.tags},
                metadata={
                    "pattern_key": pattern_key,
                    "evidence_count": len(episodes),
                },
                importance=min(1.0, 0.5 + (0.1 * len(episodes))),
                source_episode_ids=source_ids,
            )
            created["semantic"].append(semantic.id)

            procedural_candidate = latest.metadata.get("procedural_candidate")
            successful = sum(
                1
                for episode in episodes
                if episode.metadata.get("outcome") == "success"
            )
            if procedural_candidate and successful >= min_repetitions:
                procedure = self.add_procedural(
                    str(procedural_candidate),
                    tags={"crystallized-skill", *latest.tags},
                    metadata={
                        "pattern_key": pattern_key,
                        "success_count": successful,
                    },
                    importance=min(1.0, 0.6 + (0.1 * successful)),
                    source_episode_ids=source_ids,
                )
                created["procedural"].append(procedure.id)

        return created

    def to_dict(self) -> Dict[str, Any]:
        return {
            "version": 1,
            "episodic": [asdict(record) for record in self.episodic],
            "semantic": [asdict(record) for record in self.semantic],
            "procedural": [asdict(record) for record in self.procedural],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MemoryStore":
        def records(kind: str) -> List[MemoryRecord]:
            parsed: List[MemoryRecord] = []
            for item in data.get(kind, []):
                payload = dict(item)
                payload.setdefault("kind", kind)
                parsed.append(MemoryRecord(**payload))
            return parsed

        return cls(
            episodic=records("episodic"),
            semantic=records("semantic"),
            procedural=records("procedural"),
        )

    def save(self, path: Path | str) -> None:
        destination = Path(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(self.to_dict(), indent=2, sort_keys=True)
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=destination.parent, delete=False
        ) as handle:
            handle.write(payload)
            handle.write("\n")
            temporary_name = handle.name
        os.replace(temporary_name, destination)

    @classmethod
    def load(cls, path: Path | str) -> "MemoryStore":
        source = Path(path)
        if not source.exists():
            return cls()
        with source.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict):
            raise ValueError(f"Memory store at {source} must be a JSON object.")
        return cls.from_dict(data)
