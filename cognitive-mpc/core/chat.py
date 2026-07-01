"""Conversational adapter for the Cognitive MPC control loop.

The chat layer does not replace planning with canned dialogue. It translates
messages into either goals or observations, runs the real controller, and
returns a concise conversational summary plus the complete decision trace.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from .approvals import ApprovalStore
from .config import SettingsStore
from .controller import CognitiveController, CycleResult
from .intent import IntentDecision, IntentRouter
from .llm import (
    DisabledLanguageModel,
    LanguageModel,
    ModelStatus,
    OllamaLanguageModel,
)
from .state import Goal
from .tools import ToolRegistry


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


@dataclass
class ChatMessage:
    id: str
    role: str
    content: str
    created_at: str = field(default_factory=utc_now)
    cycle_number: Optional[int] = None
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Conversation:
    id: str
    title: str = "New chat"
    goal_id: Optional[str] = None
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)
    messages: List[ChatMessage] = field(default_factory=list)

    def add_message(
        self,
        role: str,
        content: str,
        *,
        cycle_number: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> ChatMessage:
        message = ChatMessage(
            id=new_id("msg"),
            role=role,
            content=content,
            cycle_number=cycle_number,
            details=dict(details or {}),
        )
        self.messages.append(message)
        self.updated_at = utc_now()
        return message


@dataclass
class ChatStore:
    """Persistent conversation history, separate from cognitive memory."""

    version: int = 1
    active_conversation_id: Optional[str] = None
    conversations: List[Conversation] = field(default_factory=list)

    def create_conversation(
        self,
        *,
        title: str = "New chat",
        goal_id: Optional[str] = None,
    ) -> Conversation:
        conversation = Conversation(
            id=new_id("chat"),
            title=title,
            goal_id=goal_id,
        )
        self.conversations.append(conversation)
        self.active_conversation_id = conversation.id
        return conversation

    def active_conversation(self) -> Conversation:
        for conversation in self.conversations:
            if conversation.id == self.active_conversation_id:
                return conversation
        return self.create_conversation()

    def get(self, conversation_id: str) -> Optional[Conversation]:
        return next(
            (
                conversation
                for conversation in self.conversations
                if conversation.id == conversation_id
            ),
            None,
        )

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ChatStore":
        conversations: List[Conversation] = []
        for raw_conversation in data.get("conversations", []):
            payload = dict(raw_conversation)
            payload["messages"] = [
                ChatMessage(**message) for message in payload.get("messages", [])
            ]
            conversations.append(Conversation(**payload))
        return cls(
            version=int(data.get("version", 1)),
            active_conversation_id=data.get("active_conversation_id"),
            conversations=conversations,
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
    def load(cls, path: Path | str) -> "ChatStore":
        source = Path(path)
        if not source.exists():
            return cls()
        with source.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict):
            raise ValueError(f"Chat history at {source} must be a JSON object.")
        return cls.from_dict(data)


class CognitiveChatRuntime:
    """Thread-safe conversational facade around ``CognitiveController``."""

    def __init__(
        self,
        controller: CognitiveController,
        history_path: Path | str,
        language_model: Optional[LanguageModel] = None,
        *,
        intent_router: Optional[IntentRouter] = None,
        approvals: Optional[ApprovalStore] = None,
        settings: Optional[SettingsStore] = None,
        activity_callback: Optional[Callable[[], None]] = None,
    ) -> None:
        self.controller = controller
        self.history_path = Path(history_path)
        self.language_model = language_model or DisabledLanguageModel()
        self.intent_router = intent_router or IntentRouter(
            self.language_model
            if isinstance(self.language_model, OllamaLanguageModel)
            else None
        )
        self.approvals = approvals
        self.settings = settings
        self.activity_callback = activity_callback
        self.store = ChatStore.load(self.history_path)
        self._lock = threading.RLock()
        self._ensure_initial_conversation()

    def _ensure_initial_conversation(self) -> None:
        """Recover an unfinished terminal task into the first web conversation."""

        if self.store.conversations:
            self.store.active_conversation()
            return

        pending = self.controller.state.latest_pending_task()
        if pending:
            goal = self.controller.state.get_goal(pending.goal_id)
            conversation = self.store.create_conversation(
                title=self._title(goal.text if goal else "Recovered goal"),
                goal_id=pending.goal_id,
            )
            conversation.add_message(
                "assistant",
                (
                    "I recovered an unfinished Cognitive MPC cycle from the terminal.\n\n"
                    f"Pending action\n{pending.description}\n\n"
                    "Tell me what happened, or start a new chat for a different goal."
                ),
                details={
                    "kind": "recovered_action",
                    "pending_action": pending.description,
                    "task_id": pending.id,
                },
            )
        else:
            self.store.create_conversation()
        self.store.save(self.history_path)

    def status(self) -> Dict[str, Any]:
        with self._lock:
            conversation = self.store.active_conversation()
            goal = self._conversation_goal(conversation)
            pending = (
                self.controller.state.latest_pending_task(goal.id) if goal else None
            )
            conversations = sorted(
                self.store.conversations,
                key=lambda item: item.updated_at,
                reverse=True,
            )
            return {
                "conversation": asdict(conversation),
                "conversations": [
                    {
                        "id": item.id,
                        "title": item.title,
                        "updated_at": item.updated_at,
                        "active": item.id == conversation.id,
                    }
                    for item in conversations
                ],
                "current_goal": asdict(goal) if goal else None,
                "pending_action": (
                    {
                        "task_id": pending.id,
                        "description": pending.description,
                        "source_plan_id": pending.source_plan_id,
                    }
                    if pending
                    else None
                ),
                "composer_mode": "observation" if pending else "goal",
                "runtime": {
                    "cycle_count": self.controller.state.cycle_count,
                    "episodic_count": len(self.controller.memory.episodic),
                    "semantic_count": len(self.controller.memory.semantic),
                    "procedural_count": len(self.controller.memory.procedural),
                    "shell_enabled": bool(
                        self.controller.state.environment_facts.get(
                            "shell_enabled", False
                        )
                    ),
                    "model": self.language_model.status().to_dict(),
                    "workspace": (
                        str(self.controller.tools.workspace)
                        if self.controller.tools.workspace
                        else ""
                    ),
                },
            }

    def send(self, text: str, mode: str = "auto") -> Dict[str, Any]:
        clean_text = " ".join(text.split()).strip()
        if not clean_text:
            raise ValueError("Message cannot be empty.")
        if len(clean_text) > 10_000:
            raise ValueError("Message exceeds the 10,000-character limit.")

        with self._lock:
            if self.activity_callback:
                self.activity_callback()
            conversation = self.store.active_conversation()
            goal = self._conversation_goal(conversation)
            pending = (
                self.controller.state.latest_pending_task(goal.id) if goal else None
            )
            intent = self.intent_router.route(
                clean_text,
                has_pending_action=pending is not None,
                override=mode,
            )
            conversation.add_message("user", clean_text)

            if intent.needs_confirmation:
                assistant = conversation.add_message(
                    "assistant",
                    (
                        "I’m not certain how to route that message. Choose Goal, "
                        "Result, Question, or Command below and send it again. I have "
                        "not changed the pending action."
                    ),
                    details={
                        "kind": "intent_clarification",
                        "intent": intent.to_dict(),
                        "response_mode": "system",
                    },
                )
                self.store.save(self.history_path)
                return {"message": asdict(assistant), "status": self.status()}

            if intent.intent == "question":
                return self._answer_question(conversation, clean_text, intent)
            if intent.intent == "command":
                return self._handle_command(conversation, clean_text, intent)

            try:
                if intent.intent == "goal":
                    if goal is not None:
                        conversation.messages.pop()
                        conversation = self.store.create_conversation(
                            title=self._title(clean_text)
                        )
                        conversation.add_message("user", clean_text)
                    result = self.controller.run_cycle(clean_text)
                    conversation.goal_id = result.goal.id
                    conversation.title = self._title(result.goal.text)
                    is_observation = False
                elif goal is not None:
                    result = self.controller.run_cycle(
                        goal.text,
                        observation=clean_text,
                    )
                    is_observation = True
                else:
                    raise ValueError(
                        "There is no active goal for this observation. "
                        "Choose Goal mode first."
                    )
            except Exception:
                # Do not leave a user message in history if the transaction did
                # not produce a controller result.
                conversation.messages.pop()
                raise

            assistant_text, response_metadata = self._generate_response(
                conversation,
                result,
                is_observation=is_observation,
            )
            details = self._cycle_details(result)
            details.update(response_metadata)
            details["intent"] = intent.to_dict()
            assistant = conversation.add_message(
                "assistant",
                assistant_text,
                cycle_number=result.cycle_number,
                details=details,
            )
            self.store.save(self.history_path)
            return {
                "message": asdict(assistant),
                "status": self.status(),
            }

    def _answer_question(
        self,
        conversation: Conversation,
        text: str,
        intent: IntentDecision,
    ) -> Dict[str, Any]:
        goal = self._conversation_goal(conversation)
        pending = (
            self.controller.state.latest_pending_task(goal.id) if goal else None
        )
        model_status = self.language_model.status()
        if model_status.available:
            context = {
                "active_goal": goal.text if goal else None,
                "pending_action": pending.description if pending else None,
                "recent_observations": [
                    observation.content
                    for observation in self.controller.state.recent_observations[-5:]
                ],
                "relevant_memory": [
                    memory.content
                    for memory in self.controller.memory.search(text, limit=5)
                ],
            }
            try:
                generated = self.language_model.generate(
                    [
                        {
                            "role": "system",
                            "content": (
                                "Answer the user's question directly using the supplied "
                                "Cognitive MPC context. Do not claim that the pending "
                                "action was completed and do not silently change it."
                            ),
                        },
                        {
                            "role": "system",
                            "content": json.dumps(context, ensure_ascii=False),
                        },
                        {"role": "user", "content": text},
                    ]
                )
                content = generated.content
                mode = "generative"
                metadata = generated.metadata
            except Exception as exc:
                content = (
                    "The local model could not answer this question. The pending "
                    f"action is unchanged.\n\n{type(exc).__name__}: {exc}"
                )
                mode = "template"
                metadata = {}
        else:
            content = (
                "AI question answering is currently unavailable. The pending action "
                "is unchanged. Start Ollama and install the configured model, then retry."
            )
            mode = "template"
            metadata = {}
        assistant = conversation.add_message(
            "assistant",
            content,
            details={
                "kind": "question_answer",
                "intent": intent.to_dict(),
                "response_mode": mode,
                "model": model_status.to_dict(),
                "model_metadata": metadata,
                "pending_action_unchanged": True,
            },
        )
        self.store.save(self.history_path)
        return {"message": asdict(assistant), "status": self.status()}

    def _handle_command(
        self,
        conversation: Conversation,
        text: str,
        intent: IntentDecision,
    ) -> Dict[str, Any]:
        proposals = self._propose_tool_calls(text)[:4]
        results: List[Dict[str, Any]] = []
        approvals: List[Dict[str, Any]] = []
        for proposal in proposals:
            name = proposal["name"]
            arguments = proposal["arguments"]
            if name in {"calculator", "file_reader"}:
                result = self.controller.call_tool(name, arguments).to_dict()
                results.append(result)
                continue
            if name == "shell" and not self.controller.tools.permissions.get(
                "run_shell", False
            ):
                results.append(
                    {
                        "tool": name,
                        "allowed": False,
                        "success": False,
                        "error": (
                            "Shell is disabled. Enable it in Settings; every exact "
                            "command will still require one-time approval."
                        ),
                    }
                )
                continue
            if name in {"note_writer", "shell"} and self.approvals:
                approvals.append(
                    self.approvals.create(
                        conversation_id=conversation.id,
                        cycle_number=None,
                        tool_name=name,
                        arguments=arguments,
                        rationale=f"Requested by user command: {text[:300]}",
                        risk="high" if name == "shell" else "medium",
                    )
                )
            else:
                results.append(
                    {
                        "tool": name,
                        "allowed": False,
                        "success": False,
                        "error": "Approval storage is unavailable.",
                    }
                )

        if not proposals:
            content = (
                "I could not map that command to a supported tool. Try an explicit "
                "request such as “calculate 12 * 8”, “read README.md”, "
                "or “write note notes/idea.md: …”."
            )
        else:
            lines = []
            for result in results:
                if result.get("success"):
                    lines.append(
                        f"{result.get('tool')}: {result.get('output', '').strip()}"
                    )
                else:
                    lines.append(
                        f"{result.get('tool')}: {result.get('error', 'failed')}"
                    )
            for approval in approvals:
                lines.append(
                    f"{approval['tool_name']}: approval required for the exact "
                    f"arguments shown in the approval card."
                )
            content = "\n\n".join(lines)

        assistant = conversation.add_message(
            "assistant",
            content,
            details={
                "kind": "tool_command",
                "intent": intent.to_dict(),
                "response_mode": "tool",
                "tool_results": results,
                "approval_requests": approvals,
                "tool_call_count": len(proposals),
            },
        )
        self.store.save(self.history_path)
        return {"message": asdict(assistant), "status": self.status()}

    def _propose_tool_calls(self, text: str) -> List[Dict[str, Any]]:
        explicit = self._rule_tool_calls(text)
        if explicit:
            return explicit
        if isinstance(self.language_model, OllamaLanguageModel):
            try:
                response = self.language_model.complete(
                    [
                        {
                            "role": "system",
                            "content": (
                                "Translate the user's explicit command into supported "
                                "tool calls. Do not call more than four tools. Do not "
                                "invent a file path or shell argument."
                            ),
                        },
                        {"role": "user", "content": text},
                    ],
                    temperature=0.0,
                    num_predict=300,
                    tools=ToolRegistry.model_schemas(),
                )
                return [
                    {"name": call.name, "arguments": call.arguments}
                    for call in response.tool_calls[:4]
                ]
            except RuntimeError:
                pass
        return []

    @staticmethod
    def _rule_tool_calls(text: str) -> List[Dict[str, Any]]:
        lowered = text.casefold().strip()
        calculate = re.match(r"^(?:calculate|compute)\s+(.+)$", text, re.I)
        if calculate:
            return [
                {
                    "name": "calculator",
                    "arguments": {"expression": calculate.group(1).strip()},
                }
            ]
        read = re.match(
            r"^(?:read|open|inspect)\s+(?:file\s+)?(.+)$",
            text,
            re.I,
        )
        if read:
            return [
                {
                    "name": "file_reader",
                    "arguments": {"path": read.group(1).strip(" \"'")},
                }
            ]
        note = re.match(
            r"^(?:write|save|append)\s+(?:a\s+)?note\s+([^:]+):\s*(.+)$",
            text,
            re.I | re.S,
        )
        if note:
            return [
                {
                    "name": "note_writer",
                    "arguments": {
                        "path": note.group(1).strip(" \"'"),
                        "content": note.group(2).strip(),
                    },
                }
            ]
        return []

    def new_conversation(self) -> Dict[str, Any]:
        """Start a clean dialogue while preserving state and long-term memory."""

        with self._lock:
            conversation = self.store.create_conversation()
            self.store.save(self.history_path)
            return self.status()

    def switch_conversation(self, conversation_id: str) -> Dict[str, Any]:
        with self._lock:
            if not self.store.get(conversation_id):
                raise ValueError("Conversation not found.")
            self.store.active_conversation_id = conversation_id
            self.store.save(self.history_path)
            return self.status()

    def _conversation_goal(self, conversation: Conversation) -> Optional[Goal]:
        if not conversation.goal_id:
            return None
        return self.controller.state.get_goal(conversation.goal_id)

    @staticmethod
    def _title(text: str, limit: int = 42) -> str:
        clean = " ".join(text.split()).strip()
        return clean if len(clean) <= limit else f"{clean[: limit - 1].rstrip()}…"

    @staticmethod
    def _response_text(result: CycleResult, *, is_observation: bool) -> str:
        decision = result.decision
        prefix = (
            f"I recorded that as a {result.observation_outcome or 'neutral'} "
            "observation and replanned."
            if is_observation
            else f"I treated that as a goal and compared {len(result.candidates)} strategies."
        )
        return (
            f"Template-mode control result\n\n{prefix}\n\n"
            f"Selected approach\n{decision.plan_title}\n\n"
            f"Next action\n{decision.step.description}\n\n"
            f"Why this action\n{decision.reason}\n\n"
            f"Expected feedback\n{decision.step.feedback_signal}\n\n"
            "Tell me what happened after this action. I will update the world "
            "state and plan again."
        )

    def _generate_response(
        self,
        conversation: Conversation,
        result: CycleResult,
        *,
        is_observation: bool,
    ) -> tuple[str, Dict[str, Any]]:
        """Use a real model when available; fall back without pretending."""

        model_status = self.language_model.status()
        fallback = self._response_text(result, is_observation=is_observation)
        if not model_status.available:
            return fallback, {
                "response_mode": "template",
                "model": model_status.to_dict(),
            }

        decision_context = self._model_decision_context(result)
        messages: List[Dict[str, str]] = [
            {
                "role": "system",
                "content": (
                    "You are the generative communication and cognitive-action layer "
                    "for a Cognitive MPC agent. The supplied MPC decision is "
                    "authoritative: do not replace its selected plan or invent a "
                    "different next action. Respond naturally and specifically to the "
                    "user. If the selected action asks for a cognitive artifact such as "
                    "a schedule, checklist, outline, exercise, or analysis, create a "
                    "useful first version now rather than merely telling the user to "
                    "create it. Never claim a physical action or tool call occurred "
                    "unless the context says it did. Keep the decision trace inspectable "
                    "without revealing hidden chain-of-thought. End by asking for one "
                    "concrete observation that the controller can use to replan. "
                    "Keep the response useful but concise (roughly 250 words maximum)."
                ),
            }
        ]
        for message in conversation.messages[-8:]:
            if message.role in {"user", "assistant"}:
                messages.append(
                    {
                        "role": message.role,
                        "content": message.content[:8_000],
                    }
                )
        messages.append(
            {
                "role": "system",
                "content": (
                    "Current verified Cognitive MPC decision context:\n"
                    + json.dumps(
                        decision_context,
                        indent=2,
                        sort_keys=True,
                        ensure_ascii=False,
                    )
                ),
            }
        )

        try:
            generated = self.language_model.generate(messages)
            return generated.content, {
                "response_mode": "generative",
                "model": {
                    **model_status.to_dict(),
                    "provider": generated.provider,
                    "model": generated.model,
                },
                "model_metadata": generated.metadata,
            }
        except Exception as exc:
            return (
                f"{fallback}\n\nModel fallback reason\n{type(exc).__name__}: {exc}",
                {
                    "response_mode": "template",
                    "model": {
                        **model_status.to_dict(),
                        "available": False,
                        "mode": "template",
                        "detail": f"Generation failed: {type(exc).__name__}: {exc}",
                    },
                },
            )

    def _model_decision_context(self, result: CycleResult) -> Dict[str, Any]:
        remembered = self.controller.memory.search(
            result.goal.text,
            kinds=["semantic", "procedural"],
            limit=5,
        )
        return {
            "goal": result.goal.text,
            "observation_outcome": result.observation_outcome,
            "cycle_number": result.cycle_number,
            "selected_plan": result.decision.plan_title,
            "selected_action": result.decision.step.description,
            "expected_feedback": result.decision.step.feedback_signal,
            "decision_reason": result.decision.reason,
            "alternative_plans": [
                {
                    "title": candidate.plan.title,
                    "adjusted_score": candidate.adjusted_score,
                    "verified": candidate.verification.passed,
                }
                for candidate in result.candidates
            ],
            "retrieved_memory": [record.content for record in remembered],
        }

    @staticmethod
    def _cycle_details(result: CycleResult) -> Dict[str, Any]:
        candidates: List[Dict[str, Any]] = []
        for candidate in result.candidates:
            simulation = candidate.simulation
            candidates.append(
                {
                    "id": candidate.plan.id,
                    "title": candidate.plan.title,
                    "rationale": candidate.plan.rationale,
                    "passed": candidate.verification.passed,
                    "adjusted_score": candidate.adjusted_score,
                    "raw_score": simulation.score,
                    "score": {
                        "benefit": simulation.likely_benefit,
                        "compounding_value": simulation.compounding_value,
                        "reversibility": simulation.reversibility,
                        "cost": simulation.likely_cost,
                        "risk": simulation.risk,
                        "uncertainty": simulation.uncertainty,
                        "verification_penalty": candidate.verification.penalty,
                        "history_penalty": candidate.history_penalty,
                    },
                    "assumptions": candidate.plan.assumptions,
                    "risks": candidate.plan.predicted_risks,
                    "warnings": candidate.verification.warnings,
                    "errors": candidate.verification.errors,
                    "next_step": (
                        candidate.next_step.description
                        if candidate.next_step
                        else None
                    ),
                }
            )
        return {
            "kind": "control_cycle",
            "cycle_number": result.cycle_number,
            "observation_outcome": result.observation_outcome,
            "selected_plan_id": result.decision.plan_id,
            "selected_action": result.decision.step.description,
            "decision_reason": result.decision.reason,
            "candidates": candidates,
            "memory_update": result.memory_update,
            "planning_backend": result.planning_metadata,
            "scheduler": [
                process.process.value for process in result.scheduled_processes
            ],
        }
