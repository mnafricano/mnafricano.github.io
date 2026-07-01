"""Persistent, single-use approval records for consequential tool calls."""

from __future__ import annotations

import json
import os
import tempfile
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .logging import StructuredLogger
from .tools import ToolRegistry, ToolResult


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ApprovalRequest:
    id: str
    conversation_id: str
    cycle_number: Optional[int]
    tool_name: str
    arguments: Dict[str, Any]
    rationale: str
    risk: str
    status: str = "pending"
    created_at: str = field(default_factory=utc_now)
    expires_at: str = ""
    resolved_at: str = ""
    result: Optional[Dict[str, Any]] = None

    @classmethod
    def create(
        cls,
        conversation_id: str,
        cycle_number: Optional[int],
        tool_name: str,
        arguments: Dict[str, Any],
        rationale: str,
        risk: str,
        ttl_minutes: int = 10,
    ) -> "ApprovalRequest":
        expires = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
        return cls(
            id=f"approval_{uuid.uuid4().hex[:12]}",
            conversation_id=conversation_id,
            cycle_number=cycle_number,
            tool_name=tool_name,
            arguments=dict(arguments),
            rationale=rationale,
            risk=risk,
            expires_at=expires.isoformat(),
        )

    def is_expired(self) -> bool:
        return datetime.now(timezone.utc) >= datetime.fromisoformat(self.expires_at)


class ApprovalStore:
    def __init__(
        self,
        path: Path | str,
        registry: ToolRegistry,
        logger: Optional[StructuredLogger] = None,
    ) -> None:
        self.path = Path(path)
        self.registry = registry
        self.logger = logger
        self._lock = threading.RLock()
        self.requests = self._load()
        self.expire_pending()

    def _load(self) -> List[ApprovalRequest]:
        if not self.path.exists():
            return []
        with self.path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return [ApprovalRequest(**item) for item in payload.get("requests", [])]

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(
            {
                "version": 1,
                "requests": [asdict(item) for item in self.requests],
            },
            indent=2,
            sort_keys=True,
        )
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=self.path.parent, delete=False
        ) as handle:
            handle.write(payload)
            handle.write("\n")
            temporary_name = handle.name
        os.replace(temporary_name, self.path)

    def list(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            self.expire_pending()
            records = self.requests
            if status:
                records = [item for item in records if item.status == status]
            return [asdict(item) for item in reversed(records)]

    def get(self, approval_id: str) -> ApprovalRequest:
        request = next((item for item in self.requests if item.id == approval_id), None)
        if request is None:
            raise ValueError("Approval request not found.")
        return request

    def create(
        self,
        *,
        conversation_id: str,
        cycle_number: Optional[int],
        tool_name: str,
        arguments: Dict[str, Any],
        rationale: str,
        risk: str = "medium",
    ) -> Dict[str, Any]:
        with self._lock:
            request = ApprovalRequest.create(
                conversation_id,
                cycle_number,
                tool_name,
                arguments,
                rationale,
                risk,
            )
            self.requests.append(request)
            self._save()
            self._log("approval_requested", asdict(request))
            return asdict(request)

    def deny(self, approval_id: str) -> Dict[str, Any]:
        with self._lock:
            request = self.get(approval_id)
            self._require_pending(request)
            request.status = "denied"
            request.resolved_at = utc_now()
            self._save()
            self._log("approval_denied", asdict(request))
            return asdict(request)

    def approve(self, approval_id: str) -> Dict[str, Any]:
        with self._lock:
            request = self.get(approval_id)
            self._require_pending(request)
            request.status = "approved"
            request.resolved_at = utc_now()
            self._save()

            result: ToolResult = self.registry.call(
                request.tool_name,
                request.arguments,
            )
            request.result = result.to_dict()
            request.status = "executed" if result.success else "failed"
            self._save()
            self._log("approval_executed", asdict(request))
            return asdict(request)

    def expire_pending(self) -> None:
        changed = False
        for request in self.requests:
            if request.status == "pending" and request.is_expired():
                request.status = "expired"
                request.resolved_at = utc_now()
                changed = True
        if changed:
            self._save()

    def _require_pending(self, request: ApprovalRequest) -> None:
        if request.status != "pending":
            raise ValueError(f"Approval is already {request.status}.")
        if request.is_expired():
            request.status = "expired"
            request.resolved_at = utc_now()
            self._save()
            self._log("approval_expired", asdict(request))
            raise ValueError("Approval request has expired.")

    def _log(self, event_type: str, payload: Dict[str, Any]) -> None:
        if self.logger:
            self.logger.log(event_type, payload)
