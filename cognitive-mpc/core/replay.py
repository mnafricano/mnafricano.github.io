"""Experience replay and lightweight strategy reflection."""

from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass
from typing import Any, Dict, List

from .memory import MemoryRecord, MemoryStore


@dataclass
class ReplaySummary:
    reviewed_episode_ids: List[str]
    surprises: List[str]
    failures: List[str]
    successes: List[str]
    pattern_to_store: str
    future_strategy_change: str
    memory_id: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class MemoryReplay:
    """Review recent episodes and write the conclusions back to memory."""

    def review(self, memory: MemoryStore, limit: int = 12) -> ReplaySummary:
        episodes = [
            episode for episode in memory.episodic if "replay" not in episode.tags
        ][-limit:]
        surprises = [
            episode.content
            for episode in episodes
            if float(episode.metadata.get("surprise", 0.0)) >= 0.5
            or "unexpected" in episode.content.casefold()
        ]
        failures = [
            episode.content
            for episode in episodes
            if episode.metadata.get("outcome") == "failure"
        ]
        successes = [
            episode.content
            for episode in episodes
            if episode.metadata.get("outcome") == "success"
        ]

        pattern_keys = [
            str(episode.metadata["pattern_key"])
            for episode in episodes
            if episode.metadata.get("pattern_key")
        ]
        if pattern_keys:
            pattern, frequency = Counter(pattern_keys).most_common(1)[0]
            pattern_to_store = f"{pattern} appeared {frequency} time(s) in the replay window."
        else:
            pattern_to_store = "No repeated tagged pattern was strong enough to store yet."

        if failures:
            future_change = (
                "Reduce the next action's scope and verify prerequisites before retrying."
            )
        elif successes:
            future_change = (
                "Preserve short feedback loops and reuse the successful action structure."
            )
        else:
            future_change = "Collect a clearer success or failure signal in the next cycle."

        summary = ReplaySummary(
            reviewed_episode_ids=[episode.id for episode in episodes],
            surprises=surprises,
            failures=failures,
            successes=successes,
            pattern_to_store=pattern_to_store,
            future_strategy_change=future_change,
        )
        content = (
            f"Replay reviewed {len(episodes)} episodes. "
            f"Surprises: {len(surprises)}; failures: {len(failures)}; "
            f"successes: {len(successes)}. Pattern: {pattern_to_store} "
            f"Strategy update: {future_change}"
        )
        record = memory.add_episodic(
            content,
            tags=["replay", "reflection"],
            metadata={
                "pattern_key": "system:replay-summary",
                "semantic_summary": (
                    "Replay should preserve short feedback loops and shrink actions "
                    "after failures."
                ),
                "outcome": "neutral",
            },
            importance=0.7,
        )
        summary.memory_id = record.id
        return summary
