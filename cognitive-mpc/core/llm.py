"""Optional language-model backends for grounded conversational responses.

The control architecture does not depend on a model. A language model may
explain or carry out the selected cognitive action, but it never bypasses the
planner, simulator, verifier, or controller.
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Iterator, List, Mapping, Optional, Protocol, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass(frozen=True)
class ModelStatus:
    available: bool
    provider: str
    model: str
    mode: str
    detail: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ModelResponse:
    content: str
    provider: str
    model: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    tool_calls: List["ModelToolCall"] = field(default_factory=list)


@dataclass
class ModelToolCall:
    name: str
    arguments: Dict[str, Any]


class LanguageModel(Protocol):
    """Minimal provider contract used by the chat adapter."""

    def status(self, *, force: bool = False) -> ModelStatus:
        ...

    def generate(self, messages: Sequence[Mapping[str, str]]) -> ModelResponse:
        ...


class DisabledLanguageModel:
    """Explicit non-model backend used by the terminal and unit tests."""

    def status(self, *, force: bool = False) -> ModelStatus:
        return ModelStatus(
            available=False,
            provider="none",
            model="",
            mode="template",
            detail="No language-model backend is configured.",
        )

    def generate(self, messages: Sequence[Mapping[str, str]]) -> ModelResponse:
        raise RuntimeError("No language-model backend is configured.")


class OllamaLanguageModel:
    """Standard-library client for Ollama's local ``/api/chat`` endpoint."""

    def __init__(
        self,
        *,
        base_url: str = "http://127.0.0.1:11434",
        model: Optional[str] = None,
        timeout: float = 90.0,
        status_cache_seconds: float = 5.0,
    ) -> None:
        normalized = base_url.rstrip("/")
        self.api_root = normalized if normalized.endswith("/api") else f"{normalized}/api"
        self.requested_model = model
        self.timeout = timeout
        self.status_cache_seconds = status_cache_seconds
        self._cached_status: Optional[ModelStatus] = None
        self._status_timestamp = 0.0

    def status(self, *, force: bool = False) -> ModelStatus:
        now = time.monotonic()
        if (
            not force
            and self._cached_status is not None
            and now - self._status_timestamp < self.status_cache_seconds
        ):
            return self._cached_status

        try:
            request = Request(
                f"{self.api_root}/tags",
                headers={"Accept": "application/json"},
                method="GET",
            )
            with urlopen(request, timeout=min(self.timeout, 2.0)) as response:
                payload = json.load(response)
            models = [
                str(item.get("name", "")).strip()
                for item in payload.get("models", [])
                if str(item.get("name", "")).strip()
            ]
            selected = self.requested_model or (models[0] if models else "")
            if self.requested_model and self.requested_model not in models:
                status = ModelStatus(
                    available=False,
                    provider="ollama",
                    model=self.requested_model,
                    mode="template",
                    detail=(
                        f"Ollama is running, but model {self.requested_model!r} "
                        "is not installed."
                    ),
                )
            elif selected:
                status = ModelStatus(
                    available=True,
                    provider="ollama",
                    model=selected,
                    mode="generative",
                    detail=f"Local Ollama model {selected} is ready.",
                )
            else:
                status = ModelStatus(
                    available=False,
                    provider="ollama",
                    model="",
                    mode="template",
                    detail="Ollama is running, but no local model is installed.",
                )
        except (OSError, HTTPError, URLError, ValueError, json.JSONDecodeError) as exc:
            status = ModelStatus(
                available=False,
                provider="ollama",
                model=self.requested_model or "",
                mode="template",
                detail=f"Ollama is unavailable at {self.api_root}: {type(exc).__name__}.",
            )

        self._cached_status = status
        self._status_timestamp = now
        return status

    def generate(self, messages: Sequence[Mapping[str, str]]) -> ModelResponse:
        return self.complete(messages, temperature=0.4, num_predict=500)

    def complete(
        self,
        messages: Sequence[Mapping[str, Any]],
        *,
        temperature: float = 0.4,
        num_predict: int = 900,
        format_schema: Optional[Dict[str, Any] | str] = None,
        tools: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> ModelResponse:
        status = self.status(force=True)
        if not status.available:
            raise RuntimeError(status.detail)

        payload: Dict[str, Any] = {
            "model": status.model,
            "messages": [dict(message) for message in messages],
            "stream": False,
            "think": False,
            "keep_alive": "10m",
            "options": {
                "temperature": temperature,
                "num_predict": num_predict,
            },
        }
        if format_schema is not None:
            payload["format"] = format_schema
        if tools:
            payload["tools"] = list(tools)
        body = json.dumps(payload).encode("utf-8")
        request = Request(
            f"{self.api_root}/chat",
            data=body,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                payload = json.load(response)
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise RuntimeError(
                f"Ollama returned HTTP {exc.code}: {detail or exc.reason}"
            ) from exc
        except (OSError, URLError, ValueError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Ollama generation failed: {exc}") from exc

        message = payload.get("message", {})
        content = str(message.get("content", "")).strip()
        tool_calls = self._parse_tool_calls(message.get("tool_calls", []))
        if not content and not tool_calls:
            raise RuntimeError("Ollama returned an empty response.")
        return ModelResponse(
            content=content,
            provider="ollama",
            model=str(payload.get("model", status.model)),
            tool_calls=tool_calls,
            metadata={
                "done_reason": payload.get("done_reason"),
                "prompt_eval_count": payload.get("prompt_eval_count"),
                "eval_count": payload.get("eval_count"),
                "total_duration": payload.get("total_duration"),
            },
        )

    def structured(
        self,
        messages: Sequence[Mapping[str, Any]],
        schema: Dict[str, Any],
        *,
        temperature: float = 0.0,
        num_predict: int = 1200,
    ) -> Dict[str, Any]:
        response = self.complete(
            messages,
            temperature=temperature,
            num_predict=num_predict,
            format_schema=schema,
        )
        try:
            payload = json.loads(response.content)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Model returned invalid structured JSON: {exc}") from exc
        if not isinstance(payload, dict):
            raise RuntimeError("Structured model response must be a JSON object.")
        return payload

    def stream(
        self,
        messages: Sequence[Mapping[str, Any]],
        *,
        temperature: float = 0.4,
        num_predict: int = 1200,
    ) -> Iterator[Dict[str, Any]]:
        """Yield token and completion events from Ollama's NDJSON stream."""

        status = self.status(force=True)
        if not status.available:
            raise RuntimeError(status.detail)
        body = json.dumps(
            {
                "model": status.model,
                "messages": [dict(message) for message in messages],
                "stream": True,
                "think": False,
                "keep_alive": "10m",
                "options": {
                    "temperature": temperature,
                    "num_predict": num_predict,
                },
            }
        ).encode("utf-8")
        request = Request(
            f"{self.api_root}/chat",
            data=body,
            headers={
                "Accept": "application/x-ndjson",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                for raw_line in response:
                    if not raw_line.strip():
                        continue
                    chunk = json.loads(raw_line)
                    message = chunk.get("message", {})
                    content = str(message.get("content", ""))
                    if content:
                        yield {"type": "token", "content": content}
                    if chunk.get("done"):
                        yield {
                            "type": "done",
                            "model": str(chunk.get("model", status.model)),
                            "tool_calls": [
                                {
                                    "name": call.name,
                                    "arguments": call.arguments,
                                }
                                for call in self._parse_tool_calls(
                                    message.get("tool_calls", [])
                                )
                            ],
                            "metadata": {
                                "done_reason": chunk.get("done_reason"),
                                "prompt_eval_count": chunk.get("prompt_eval_count"),
                                "eval_count": chunk.get("eval_count"),
                                "total_duration": chunk.get("total_duration"),
                            },
                        }
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise RuntimeError(
                f"Ollama returned HTTP {exc.code}: {detail or exc.reason}"
            ) from exc
        except (OSError, URLError, ValueError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Ollama streaming failed: {exc}") from exc

    def embed(self, texts: Sequence[str]) -> Dict[str, Any]:
        """Return local embeddings when the configured model supports them.

        Vector memory is intentionally not enabled in v1; this method is the
        future-facing adapter seam and does not alter current lexical search.
        """

        status = self.status(force=True)
        if not status.available:
            raise RuntimeError(status.detail)
        cleaned = [str(text).strip() for text in texts if str(text).strip()]
        if not cleaned:
            raise ValueError("Embedding input cannot be empty.")
        request = Request(
            f"{self.api_root}/embed",
            data=json.dumps(
                {"model": status.model, "input": cleaned, "truncate": True}
            ).encode("utf-8"),
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                payload = json.load(response)
        except (OSError, HTTPError, URLError, ValueError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Ollama embedding failed: {exc}") from exc
        embeddings = payload.get("embeddings", [])
        if not isinstance(embeddings, list) or len(embeddings) != len(cleaned):
            raise RuntimeError("Ollama returned an invalid embedding response.")
        return {
            "model": str(payload.get("model", status.model)),
            "embeddings": embeddings,
            "metadata": {
                "total_duration": payload.get("total_duration"),
                "load_duration": payload.get("load_duration"),
                "prompt_eval_count": payload.get("prompt_eval_count"),
            },
        }

    @staticmethod
    def _parse_tool_calls(raw_calls: Any) -> List[ModelToolCall]:
        calls: List[ModelToolCall] = []
        if not isinstance(raw_calls, list):
            return calls
        for raw in raw_calls[:4]:
            function = raw.get("function", {}) if isinstance(raw, dict) else {}
            name = str(function.get("name", "")).strip()
            arguments = function.get("arguments", {})
            if name and isinstance(arguments, dict):
                calls.append(ModelToolCall(name=name, arguments=dict(arguments)))
        return calls
