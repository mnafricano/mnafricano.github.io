"""Append-only structured audit logging for Cognitive MPC cycles."""

from __future__ import annotations

import json
import threading
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Iterable, List


def _json_safe(value: Any) -> Any:
    if is_dataclass(value):
        return _json_safe(asdict(value))
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    if isinstance(value, Path):
        return str(value)
    return value


class StructuredLogger:
    """Write one independently parseable JSON object per line."""

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def log(self, event_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        event = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": event_type,
            **_json_safe(payload),
        }
        line = json.dumps(event, sort_keys=True)
        with self._lock:
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(line)
                handle.write("\n")
        return event

    def log_cycle(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Log the complete inspectable decision record for one control cycle."""

        required = {
            "goal",
            "state_snapshot",
            "candidate_plans",
            "simulations",
            "verification",
            "selected_action",
            "memory_update",
        }
        missing = required - payload.keys()
        if missing:
            raise ValueError(f"Cycle log is missing fields: {sorted(missing)}")
        return self.log("control_cycle", payload)

    def read(self, limit: int | None = None) -> List[Dict[str, Any]]:
        if not self.path.exists():
            return []
        with self.path.open("r", encoding="utf-8") as handle:
            records = [json.loads(line) for line in handle if line.strip()]
        return records[-limit:] if limit is not None else records

    def iter_events(self) -> Iterable[Dict[str, Any]]:
        yield from self.read()
