"""A tiny operating-system-inspired scheduler for cognitive processes."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from enum import Enum
from typing import Any, Dict, List, Optional


class CognitiveProcess(str, Enum):
    PLANNING = "planning"
    VERIFICATION = "verification"
    CONSOLIDATION = "memory_consolidation"
    REPLAY = "replay"
    REFLECTION = "reflection"


@dataclass
class ScheduledProcess:
    process: CognitiveProcess
    priority: int
    reason: str

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["process"] = self.process.value
        return payload


@dataclass
class SchedulerConfig:
    consolidation_interval: int = 3
    replay_interval: int = 4
    minimum_episodes_for_consolidation: int = 3


class CognitiveScheduler:
    """Select foreground and maintenance work for each control cycle."""

    def __init__(self, config: Optional[SchedulerConfig] = None) -> None:
        self.config = config or SchedulerConfig()

    def schedule(
        self,
        cycle_number: int,
        *,
        observation_outcome: Optional[str] = None,
        episodic_count: int = 0,
    ) -> List[ScheduledProcess]:
        queue = [
            ScheduledProcess(
                CognitiveProcess.PLANNING,
                100,
                "Every control cycle must reconsider candidate futures.",
            ),
            ScheduledProcess(
                CognitiveProcess.VERIFICATION,
                90,
                "Every candidate must be checked before selection.",
            ),
        ]

        if observation_outcome is not None:
            priority = 85 if observation_outcome == "failure" else 60
            queue.append(
                ScheduledProcess(
                    CognitiveProcess.REFLECTION,
                    priority,
                    f"A new {observation_outcome} observation should update uncertainty.",
                )
            )

        if (
            episodic_count >= self.config.minimum_episodes_for_consolidation
            and cycle_number % self.config.consolidation_interval == 0
        ):
            queue.append(
                ScheduledProcess(
                    CognitiveProcess.CONSOLIDATION,
                    45,
                    "Recurring episodes may now support durable knowledge.",
                )
            )

        if episodic_count and cycle_number % self.config.replay_interval == 0:
            queue.append(
                ScheduledProcess(
                    CognitiveProcess.REPLAY,
                    40,
                    "Periodic replay is due for recent outcomes.",
                )
            )

        queue.sort(key=lambda process: process.priority, reverse=True)
        return queue
