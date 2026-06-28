"""Structured models for the Cognitive Multiplexer runtime."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


StakeLevel = Literal["low", "medium", "high"]
ComputeBudget = Literal["low", "medium", "high"]
MemoryType = Literal["episodic", "semantic", "procedural", "preference"]


class PerceptionResult(BaseModel):
    task_type: str
    goal: str
    entities: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    uncertainty: list[str] = Field(default_factory=list)
    emotional_tone: str | None = None
    required_tools: list[str] = Field(default_factory=list)
    estimated_stakes: StakeLevel = "low"


class MemoryRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    text: str
    type: MemoryType
    source: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    confidence: float = Field(ge=0.0, le=1.0)
    tags: list[str] = Field(default_factory=list)


class RetrievedMemory(BaseModel):
    record: MemoryRecord
    score: float
    reason: str


class ExpertSelection(BaseModel):
    name: str
    reason: str
    weight: float = Field(ge=0.0, le=1.0)


class RoutingPlan(BaseModel):
    selected_experts: list[ExpertSelection]
    rationale: str


class Candidate(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    kind: Literal["direct", "cautious", "creative", "single"]
    content: str
    expert_contributions: dict[str, str] = Field(default_factory=dict)


class VerificationReport(BaseModel):
    candidate_id: str
    score: int = Field(ge=0, le=100)
    factual_support: str
    internal_consistency: str
    missing_assumptions: list[str] = Field(default_factory=list)
    safety_risk: str
    instruction_following: str
    should_ask_clarifying_question: bool = False
    critique_notes: list[str] = Field(default_factory=list)


class VerificationDecision(BaseModel):
    selected_candidate_id: str
    action: Literal["select", "merge", "reject"]
    final_answer: str
    reports: list[VerificationReport]


class WorkingMemorySummary(BaseModel):
    active_goal: str | None = None
    important_constraints: list[str]
    known_facts: list[str]
    open_questions: list[str]
    intermediate_hypotheses: list[str]
    tool_results: list[str]
    candidate_count: int
    verification_notes: list[str]


class CognitiveTrace(BaseModel):
    compute_budget: ComputeBudget = "medium"
    perception: PerceptionResult
    retrieved_memories: list[RetrievedMemory]
    routing_plan: RoutingPlan
    working_memory_summary: WorkingMemorySummary
    candidate_summaries: list[dict[str, Any]]
    verification_scores: list[VerificationReport]
    final_selected_answer: str
    memory_written: bool
    written_memory: MemoryRecord | None = None


class CognitiveResult(BaseModel):
    answer: str
    trace: CognitiveTrace
