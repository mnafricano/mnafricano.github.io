"""Persistent, inspectable world state for the Cognitive MPC runtime."""

from __future__ import annotations

import json
import os
import tempfile
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


def utc_now() -> str:
    """Return a stable, timezone-aware timestamp suitable for JSON."""

    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    """Create readable identifiers without depending on a database."""

    return f"{prefix}_{uuid.uuid4().hex[:12]}"


@dataclass
class Goal:
    """A user objective tracked across repeated control cycles."""

    id: str
    text: str
    created_at: str = field(default_factory=utc_now)
    status: str = "active"


@dataclass
class Observation:
    """A new piece of evidence received from the user or environment."""

    id: str
    content: str
    timestamp: str = field(default_factory=utc_now)
    outcome: str = "neutral"
    related_task_id: Optional[str] = None
    surprise: float = 0.0


@dataclass
class ActiveTask:
    """The one-step commitment emitted by the MPC controller."""

    id: str
    goal_id: str
    description: str
    source_plan_id: str
    created_at: str = field(default_factory=utc_now)
    status: str = "awaiting_observation"
    result: Optional[str] = None
    updated_at: str = field(default_factory=utc_now)


@dataclass
class Belief:
    """A compact long-term proposition with explicit confidence."""

    content: str
    confidence: float = 0.5
    evidence_count: int = 1
    updated_at: str = field(default_factory=utc_now)


@dataclass
class WorldState:
    """Serializable state shared by planning, simulation, and verification.

    The state deliberately stores facts separately from beliefs. Facts are
    direct environment assertions, while beliefs retain uncertainty and an
    evidence count so later systems can recalibrate them.
    """

    version: int = 1
    user_goals: List[Goal] = field(default_factory=list)
    environment_facts: Dict[str, Any] = field(default_factory=dict)
    active_tasks: List[ActiveTask] = field(default_factory=list)
    uncertainty: Dict[str, float] = field(default_factory=dict)
    recent_observations: List[Observation] = field(default_factory=list)
    long_term_beliefs: Dict[str, Belief] = field(default_factory=dict)
    cycle_count: int = 0
    updated_at: str = field(default_factory=utc_now)

    def add_goal(self, text: str) -> Goal:
        """Store a goal, reusing an already-active identical goal."""

        normalized = " ".join(text.split()).strip()
        if not normalized:
            raise ValueError("Goal cannot be empty.")
        for goal in reversed(self.user_goals):
            if goal.status == "active" and goal.text.casefold() == normalized.casefold():
                return goal
        goal = Goal(id=new_id("goal"), text=normalized)
        self.user_goals.append(goal)
        self.uncertainty.setdefault(goal.id, 0.5)
        self.touch()
        return goal

    def get_goal(self, goal_id: str) -> Optional[Goal]:
        return next((goal for goal in self.user_goals if goal.id == goal_id), None)

    def add_task(self, goal_id: str, description: str, source_plan_id: str) -> ActiveTask:
        task = ActiveTask(
            id=new_id("task"),
            goal_id=goal_id,
            description=description,
            source_plan_id=source_plan_id,
        )
        self.active_tasks.append(task)
        self.touch()
        return task

    def latest_pending_task(self, goal_id: Optional[str] = None) -> Optional[ActiveTask]:
        """Return the most recent action still awaiting evidence."""

        for task in reversed(self.active_tasks):
            if task.status != "awaiting_observation":
                continue
            if goal_id is None or task.goal_id == goal_id:
                return task
        return None

    def resolve_task(self, task_id: str, result: str, outcome: str) -> Optional[ActiveTask]:
        """Close a proposed action after an observation arrives."""

        for task in self.active_tasks:
            if task.id == task_id:
                task.status = "failed" if outcome == "failure" else "completed"
                task.result = result
                task.updated_at = utc_now()
                self.touch()
                return task
        return None

    def record_observation(
        self,
        content: str,
        outcome: str = "neutral",
        related_task_id: Optional[str] = None,
        surprise: float = 0.0,
        history_limit: int = 50,
    ) -> Observation:
        observation = Observation(
            id=new_id("obs"),
            content=" ".join(content.split()).strip(),
            outcome=outcome,
            related_task_id=related_task_id,
            surprise=max(0.0, min(1.0, surprise)),
        )
        self.recent_observations.append(observation)
        self.recent_observations = self.recent_observations[-history_limit:]
        self.touch()
        return observation

    def update_belief(self, key: str, content: str, confidence_delta: float = 0.1) -> Belief:
        """Add evidence to a belief while keeping confidence bounded."""

        belief = self.long_term_beliefs.get(key)
        if belief is None:
            belief = Belief(content=content)
            self.long_term_beliefs[key] = belief
        else:
            belief.content = content
            belief.evidence_count += 1
            belief.confidence = max(0.0, min(1.0, belief.confidence + confidence_delta))
            belief.updated_at = utc_now()
        self.touch()
        return belief

    def touch(self) -> None:
        self.updated_at = utc_now()

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def snapshot(self) -> Dict[str, Any]:
        """Return an immutable-by-convention JSON-compatible snapshot."""

        return self.to_dict()

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "WorldState":
        return cls(
            version=int(data.get("version", 1)),
            user_goals=[Goal(**item) for item in data.get("user_goals", [])],
            environment_facts=dict(data.get("environment_facts", {})),
            active_tasks=[ActiveTask(**item) for item in data.get("active_tasks", [])],
            uncertainty={
                str(key): float(value) for key, value in data.get("uncertainty", {}).items()
            },
            recent_observations=[
                Observation(**item) for item in data.get("recent_observations", [])
            ],
            long_term_beliefs={
                key: Belief(**value)
                for key, value in data.get("long_term_beliefs", {}).items()
            },
            cycle_count=int(data.get("cycle_count", 0)),
            updated_at=str(data.get("updated_at", utc_now())),
        )

    def save(self, path: Path | str) -> None:
        """Atomically persist state so an interrupted write cannot corrupt it."""

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
    def load(cls, path: Path | str) -> "WorldState":
        source = Path(path)
        if not source.exists():
            return cls()
        with source.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict):
            raise ValueError(f"World state at {source} must be a JSON object.")
        return cls.from_dict(data)
