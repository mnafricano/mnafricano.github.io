"""Deterministic candidate-plan generation with a swappable backend contract."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Protocol, Sequence

from .llm import OllamaLanguageModel
from .logging import StructuredLogger
from .state import WorldState


@dataclass
class PlanStep:
    """One observable action in a candidate future trajectory."""

    id: str
    description: str
    action_type: str = "cognitive"
    prerequisites: List[str] = field(default_factory=list)
    resources: List[str] = field(default_factory=list)
    feedback_signal: str = ""
    reversible: bool = True
    estimated_effort: float = 1.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class CandidatePlan:
    """A plan horizon; the controller will commit to only one of its steps."""

    id: str
    title: str
    rationale: str
    steps: List[PlanStep]
    assumptions: List[str]
    predicted_risks: List[str]
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class PlannerBackend(Protocol):
    """Interface that an eventual local or remote LLM planner can implement."""

    def generate(
        self,
        goal: str,
        state: WorldState,
        memory_context: Sequence[str] = (),
    ) -> List[CandidatePlan]:
        ...


def _plan_id(goal: str, title: str) -> str:
    digest = hashlib.sha1(f"{goal}|{title}".encode("utf-8")).hexdigest()[:10]
    return f"plan_{digest}"


def _steps(plan_id: str, definitions: Sequence[Dict[str, Any]]) -> List[PlanStep]:
    return [
        PlanStep(id=f"{plan_id}_step_{index}", **definition)
        for index, definition in enumerate(definitions, start=1)
    ]


class HeuristicPlanner:
    """Template planner that produces meaningfully different strategies."""

    LEARNING_MARKERS = {
        "learn",
        "study",
        "understand",
        "fundamentals",
        "training",
        "routine",
        "practice",
    }
    BUILD_MARKERS = {"build", "create", "implement", "develop", "prototype", "ship"}

    def generate(
        self,
        goal: str,
        state: WorldState,
        memory_context: Sequence[str] = (),
    ) -> List[CandidatePlan]:
        clean_goal = " ".join(goal.split()).strip()
        if not clean_goal:
            raise ValueError("Planner requires a non-empty goal.")

        tokens = set(re.findall(r"[a-z0-9]+", clean_goal.casefold()))
        if tokens & self.LEARNING_MARKERS:
            plans = self._learning_plans(clean_goal)
        elif tokens & self.BUILD_MARKERS:
            plans = self._building_plans(clean_goal)
        else:
            plans = self._general_plans(clean_goal)

        # Retrieved memory does not silently rewrite the plan. It appears as an
        # explicit assumption and nudges the practice-oriented candidate.
        remembered = " ".join(memory_context).casefold()
        if any(term in remembered for term in ("hands-on", "practical", "applied project")):
            for plan in plans:
                if "practice" in plan.tags or "experiment" in plan.tags:
                    plan.assumptions.append(
                        "Retrieved memory indicates a preference for applied, practical work."
                    )
                    plan.rationale += " This also matches a remembered preference for practice."
        return plans


class OllamaPlannerBackend:
    """Model-assisted planner whose output is constrained to ``CandidatePlan``.

    The model may propose future trajectories, but it cannot select or execute
    them. The deterministic simulator, verifier, and controller remain the
    authority. Any malformed or unavailable model response visibly falls back
    to the local heuristic planner.
    """

    PLAN_SCHEMA: Dict[str, Any] = {
        "type": "object",
        "properties": {
            "plans": {
                "type": "array",
                "minItems": 3,
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "rationale": {"type": "string"},
                        "steps": {
                            "type": "array",
                            "minItems": 2,
                            "maxItems": 6,
                            "items": {
                                "type": "object",
                                "properties": {
                                    "description": {"type": "string"},
                                    "action_type": {"type": "string"},
                                    "prerequisites": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                    "resources": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                    "feedback_signal": {"type": "string"},
                                    "reversible": {"type": "boolean"},
                                    "estimated_effort": {"type": "number"},
                                },
                                "required": [
                                    "description",
                                    "action_type",
                                    "prerequisites",
                                    "resources",
                                    "feedback_signal",
                                    "reversible",
                                    "estimated_effort",
                                ],
                                "additionalProperties": False,
                            },
                        },
                        "assumptions": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "predicted_risks": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": [
                        "title",
                        "rationale",
                        "steps",
                        "assumptions",
                        "predicted_risks",
                        "tags",
                    ],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["plans"],
        "additionalProperties": False,
    }
    # A compact wire schema keeps local 8B inference responsive. The adapter
    # expands each model-proposed strategy into the full CandidatePlan contract
    # before deterministic simulation and verification see it.
    COMPACT_PLAN_SCHEMA: Dict[str, Any] = {
        "type": "object",
        "properties": {
            "plans": {
                "type": "array",
                "minItems": 3,
                "maxItems": 5,
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "maxLength": 48},
                        "rationale": {"type": "string", "maxLength": 72},
                        "first_action": {"type": "string", "maxLength": 80},
                        "feedback_signal": {"type": "string", "maxLength": 64},
                        "assumption": {"type": "string", "maxLength": 64},
                        "risk": {"type": "string", "maxLength": 64},
                        "tag": {"type": "string", "maxLength": 24},
                    },
                    "required": [
                        "title",
                        "rationale",
                        "first_action",
                        "feedback_signal",
                        "assumption",
                        "risk",
                        "tag",
                    ],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["plans"],
        "additionalProperties": False,
    }

    def __init__(
        self,
        language_model: OllamaLanguageModel,
        *,
        fallback: Optional[PlannerBackend] = None,
        logger: Optional[StructuredLogger] = None,
    ) -> None:
        self.language_model = language_model
        self.fallback = fallback or HeuristicPlanner()
        self.logger = logger
        self.last_metadata: Dict[str, Any] = {"source": "not_run"}

    def generate(
        self,
        goal: str,
        state: WorldState,
        memory_context: Sequence[str] = (),
    ) -> List[CandidatePlan]:
        failed_actions = [
            {
                "description": task.description,
                "result": task.result,
            }
            for task in state.active_tasks[-10:]
            if task.status == "failed"
        ]
        bounded_state = {
            "environment_facts": state.environment_facts,
            "uncertainty": state.uncertainty,
            "recent_observations": [
                observation.content for observation in state.recent_observations[-8:]
            ],
            "failed_actions": failed_actions,
            "relevant_memory": list(memory_context)[:8],
        }
        messages = [
            {
                "role": "system",
                "content": (
                    "You propose candidate horizons for a model-predictive-control "
                    "agent. Produce exactly 3 structurally different, concrete plans. "
                    "Each must be an alternative whole strategy, not a sequential "
                    "phase or week of one strategy. "
                    "Every first step must be immediately actionable, bounded, "
                    "reversible where possible, and include an observable feedback "
                    "signal. State prerequisites and risks honestly. Do not choose a "
                    "winner and do not claim that anything has already been done. "
                    "Be extremely concise: every field must be one short sentence of "
                    "no more than 10 words."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {"goal": " ".join(goal.split()), "world_state": bounded_state},
                    sort_keys=True,
                ),
            },
        ]
        try:
            payload = self.language_model.structured(
                messages,
                self.COMPACT_PLAN_SCHEMA,
                temperature=0.1,
                num_predict=360,
            )
            plans = self._parse_plans(goal, payload)
            self.last_metadata = {
                "source": "ollama",
                "model": self.language_model.status().model,
                "warning": "",
            }
            return plans
        except (RuntimeError, TypeError, ValueError, KeyError) as exc:
            warning = (
                f"AI planning unavailable ({type(exc).__name__}); "
                "used deterministic heuristic planning."
            )
            self.last_metadata = {
                "source": "heuristic_fallback",
                "model": self.language_model.requested_model or "",
                "warning": warning,
            }
            if self.logger is not None:
                self.logger.log(
                    "planner_fallback",
                    {"goal": goal, "warning": warning, "detail": str(exc)[:500]},
                )
            return self.fallback.generate(goal, state, memory_context)

    @classmethod
    def _parse_plans(
        cls, goal: str, payload: Dict[str, Any]
    ) -> List[CandidatePlan]:
        raw_plans = payload.get("plans")
        if not isinstance(raw_plans, list) or not 3 <= len(raw_plans) <= 5:
            raise ValueError("Structured planner must return 3 to 5 plans.")

        plans: List[CandidatePlan] = []
        titles: set[str] = set()
        for raw in raw_plans:
            if not isinstance(raw, dict):
                raise ValueError("Every plan must be an object.")
            title = cls._text(raw.get("title"), "plan title")
            if title.casefold() in titles:
                raise ValueError("Candidate plan titles must be distinct.")
            titles.add(title.casefold())
            plan_id = _plan_id(goal, title)

            raw_steps = raw.get("steps")
            if raw_steps is None and raw.get("first_action"):
                feedback = cls._text(
                    raw.get("feedback_signal"), "feedback signal"
                )
                raw_steps = [
                    {
                        "description": raw.get("first_action"),
                        "action_type": "experiment",
                        "prerequisites": [],
                        "resources": [],
                        "feedback_signal": feedback,
                        "reversible": True,
                        "estimated_effort": 0.75,
                    },
                    {
                        "description": (
                            "Review the observed result, update assumptions, and "
                            "choose whether to continue, revise, or stop."
                        ),
                        "action_type": "reflection",
                        "prerequisites": [],
                        "resources": ["notes"],
                        "feedback_signal": (
                            "A continue, revise, or stop decision is recorded."
                        ),
                        "reversible": True,
                        "estimated_effort": 0.25,
                    },
                ]
            if not isinstance(raw_steps, list) or not 2 <= len(raw_steps) <= 6:
                raise ValueError("Every plan must contain 2 to 6 steps.")
            step_definitions: List[Dict[str, Any]] = []
            for raw_step in raw_steps:
                if not isinstance(raw_step, dict):
                    raise ValueError("Every plan step must be an object.")
                effort = float(raw_step.get("estimated_effort", 1.0))
                step_definitions.append(
                    {
                        "description": cls._text(
                            raw_step.get("description"), "step description"
                        ),
                        "action_type": cls._text(
                            raw_step.get("action_type", "cognitive"),
                            "step action type",
                        ),
                        "prerequisites": cls._string_list(
                            raw_step.get("prerequisites", [])
                        ),
                        "resources": cls._string_list(
                            raw_step.get("resources", [])
                        ),
                        "feedback_signal": cls._text(
                            raw_step.get("feedback_signal"), "feedback signal"
                        ),
                        "reversible": bool(raw_step.get("reversible", True)),
                        "estimated_effort": max(0.05, min(20.0, effort)),
                    }
                )
            plans.append(
                CandidatePlan(
                    id=plan_id,
                    title=title,
                    rationale=cls._text(raw.get("rationale"), "plan rationale"),
                    steps=_steps(plan_id, step_definitions),
                    assumptions=(
                        [cls._text(raw.get("assumption"), "plan assumption")]
                        if raw.get("assumption")
                        else cls._string_list(raw.get("assumptions", []))
                    ),
                    predicted_risks=cls._string_list(
                        [raw.get("risk")]
                        if raw.get("risk")
                        else raw.get("predicted_risks", [])
                    ),
                    tags=cls._string_list(
                        [raw.get("tag")] if raw.get("tag") else raw.get("tags", [])
                    ),
                )
            )
        return plans

    @staticmethod
    def _text(value: Any, label: str) -> str:
        text = " ".join(str(value or "").split()).strip()
        if not text:
            raise ValueError(f"Missing {label}.")
        return text

    @staticmethod
    def _string_list(value: Any) -> List[str]:
        if not isinstance(value, list):
            raise ValueError("Expected a list of strings.")
        return [
            " ".join(str(item).split()).strip()
            for item in value
            if " ".join(str(item).split()).strip()
        ]
    def _learning_plans(self, goal: str) -> List[CandidatePlan]:
        title = "Foundation-first feedback sprint"
        plan_id = _plan_id(goal, title)
        foundation = CandidatePlan(
            id=plan_id,
            title=title,
            rationale=(
                "Reduce conceptual gaps first, then alternate explanation, practice, "
                "and retrieval so each cycle produces evidence."
            ),
            steps=_steps(
                plan_id,
                [
                    {
                        "description": (
                            f"Create a 7-day fundamentals sprint for “{goal}” with one "
                            "specific concept and one practical lab per day."
                        ),
                        "action_type": "planning",
                        "resources": ["note writer", "30 minutes"],
                        "feedback_signal": "A seven-day checklist exists and each day has a lab.",
                        "estimated_effort": 0.5,
                    },
                    {
                        "description": (
                            "Complete day one, explain the concept from memory, and record "
                            "the lab result."
                        ),
                        "action_type": "practice",
                        "prerequisites": ["The sprint checklist exists."],
                        "resources": ["local computer", "60 minutes"],
                        "feedback_signal": "A short explanation and lab artifact are recorded.",
                        "estimated_effort": 1.0,
                    },
                    {
                        "description": (
                            "Run a five-question retrieval check and revise the next session "
                            "around the weakest answer."
                        ),
                        "action_type": "verification",
                        "prerequisites": ["Day one is complete."],
                        "resources": ["note writer", "15 minutes"],
                        "feedback_signal": "A score and one schedule adjustment are recorded.",
                        "estimated_effort": 0.25,
                    },
                ],
            ),
            assumptions=["At least 45–60 minutes is available on most days."],
            predicted_risks=["The schedule may be too broad if the goal contains many subtopics."],
            tags=["foundation", "feedback", "compounding"],
        )

        title = "Practice-first diagnostic loop"
        plan_id = _plan_id(goal, title)
        practice = CandidatePlan(
            id=plan_id,
            title=title,
            rationale=(
                "Start with a bounded exercise, use mistakes as a diagnostic, and learn "
                "only the concepts needed to close observed gaps."
            ),
            steps=_steps(
                plan_id,
                [
                    {
                        "description": (
                            f"Choose one beginner-safe practical exercise for “{goal}” and "
                            "define a concrete success check before starting."
                        ),
                        "action_type": "practice",
                        "resources": ["local computer", "note writer"],
                        "feedback_signal": "The exercise and pass/fail check are written down.",
                        "estimated_effort": 0.5,
                    },
                    {
                        "description": (
                            "Attempt the exercise for 30 minutes while logging every blocker "
                            "and unexpected result."
                        ),
                        "action_type": "experiment",
                        "prerequisites": ["A safe exercise and success check are selected."],
                        "resources": ["local computer", "30 minutes"],
                        "feedback_signal": "An attempt log contains outputs and blockers.",
                        "estimated_effort": 0.75,
                    },
                    {
                        "description": (
                            "Study the two highest-impact blockers, retry the exercise, and "
                            "compare the before-and-after result."
                        ),
                        "action_type": "reflection",
                        "prerequisites": ["The diagnostic attempt is logged."],
                        "resources": ["learning reference", "45 minutes"],
                        "feedback_signal": "The retry resolves at least one logged blocker.",
                        "estimated_effort": 1.0,
                    },
                ],
            ),
            assumptions=["A beginner-safe local exercise is available."],
            predicted_risks=["Missing context may make early errors feel noisy or discouraging."],
            tags=["practice", "feedback", "experiment"],
        )

        title = "Project-first home lab"
        plan_id = _plan_id(goal, title)
        project = CandidatePlan(
            id=plan_id,
            title=title,
            rationale=(
                "Anchor learning in a small end-to-end artifact, then backfill theory as "
                "the project exposes gaps."
            ),
            steps=_steps(
                plan_id,
                [
                    {
                        "description": (
                            f"Define a tiny, reversible home-lab project for “{goal}” with "
                            "a one-hour first milestone and a rollback note."
                        ),
                        "action_type": "planning",
                        "resources": ["local computer", "virtualization or sandbox"],
                        "feedback_signal": "Scope, milestone, and rollback procedure are documented.",
                        "estimated_effort": 0.75,
                    },
                    {
                        "description": (
                            "Build the first milestone in an isolated environment and capture "
                            "configuration plus observed behavior."
                        ),
                        "action_type": "experiment",
                        "prerequisites": ["An isolated environment and rollback procedure exist."],
                        "resources": ["virtualization or sandbox", "90 minutes"],
                        "feedback_signal": "A reproducible artifact or a detailed failure log exists.",
                        "estimated_effort": 1.5,
                    },
                    {
                        "description": (
                            "Map each project component to its underlying concept and identify "
                            "the next smallest experiment."
                        ),
                        "action_type": "reflection",
                        "prerequisites": ["The first project milestone was attempted."],
                        "resources": ["note writer", "30 minutes"],
                        "feedback_signal": "A concept map and next experiment are recorded.",
                        "estimated_effort": 0.5,
                    },
                ],
            ),
            assumptions=["A safe sandbox or virtualization environment can be used."],
            predicted_risks=[
                "Tool setup may consume time before fundamentals are understood.",
                "An unsafe lab configuration could affect other systems if isolation is skipped.",
            ],
            tags=["project", "practice", "experiment"],
        )
        return [foundation, practice, project]

    def _building_plans(self, goal: str) -> List[CandidatePlan]:
        definitions = [
            (
                "Risk-first thin slice",
                "Test the riskiest assumption before committing to the full design.",
                ["de-risk", "feedback", "compounding"],
                [
                    (
                        f"List the three riskiest assumptions behind “{goal}” and define one "
                        "cheap falsification test for each.",
                        "A ranked assumption list and pass/fail tests exist.",
                        0.5,
                    ),
                    (
                        "Run the cheapest high-impact test and record evidence.",
                        "Observed evidence confirms or rejects one assumption.",
                        1.0,
                    ),
                    (
                        "Design the smallest end-to-end slice consistent with the evidence.",
                        "A bounded implementation slice and acceptance check exist.",
                        0.75,
                    ),
                ],
            ),
            (
                "User-visible vertical prototype",
                "Create a narrow, demonstrable result and collect feedback early.",
                ["prototype", "feedback", "practice"],
                [
                    (
                        f"Define one user-visible outcome for “{goal}” and a measurable acceptance check.",
                        "The outcome and acceptance check are unambiguous.",
                        0.5,
                    ),
                    (
                        "Implement a disposable vertical prototype with the minimum moving parts.",
                        "The prototype can be demonstrated or produces a failure artifact.",
                        1.5,
                    ),
                    (
                        "Evaluate the prototype against the acceptance check and revise scope.",
                        "Results and a scope decision are recorded.",
                        0.5,
                    ),
                ],
            ),
            (
                "Architecture-first decomposition",
                "Map interfaces and dependencies before implementation to reduce integration surprises.",
                ["architecture", "reversible"],
                [
                    (
                        f"Decompose “{goal}” into components, interfaces, and external dependencies.",
                        "A component map names every interface and owner.",
                        1.0,
                    ),
                    (
                        "Validate the component map with one interface spike.",
                        "The highest-risk interface has executable evidence.",
                        1.0,
                    ),
                    (
                        "Sequence implementation by dependency and reversibility.",
                        "A dependency-ordered backlog with checkpoints exists.",
                        0.75,
                    ),
                ],
            ),
        ]
        plans: List[CandidatePlan] = []
        for title, rationale, tags, step_defs in definitions:
            plan_id = _plan_id(goal, title)
            plans.append(
                CandidatePlan(
                    id=plan_id,
                    title=title,
                    rationale=rationale,
                    steps=_steps(
                        plan_id,
                        [
                            {
                                "description": description,
                                "action_type": "experiment" if index == 2 else "planning",
                                "resources": ["local computer", "note writer"],
                                "feedback_signal": feedback,
                                "estimated_effort": effort,
                            }
                            for index, (description, feedback, effort) in enumerate(
                                step_defs, start=1
                            )
                        ],
                    ),
                    assumptions=["The goal can be reduced to a testable intermediate result."],
                    predicted_risks=[
                        "Early evidence may force a substantial change in scope or design."
                    ],
                    tags=tags,
                )
            )
        return plans

    def _general_plans(self, goal: str) -> List[CandidatePlan]:
        definitions = [
            (
                "Clarify, then act",
                "Convert ambiguity into a measurable outcome before spending resources.",
                "Write a one-paragraph success definition and list the two largest unknowns.",
                "clarity",
            ),
            (
                "Small reversible experiment",
                "Learn from a bounded test instead of relying only on analysis.",
                "Design a 30-minute reversible experiment with a pass/fail signal.",
                "experiment",
            ),
            (
                "Constraint-first route",
                "Expose hard constraints early and build the route around them.",
                "List available time, tools, dependencies, and non-negotiable constraints.",
                "constraint",
            ),
        ]
        plans: List[CandidatePlan] = []
        for title, rationale, first_action, tag in definitions:
            plan_id = _plan_id(goal, title)
            plans.append(
                CandidatePlan(
                    id=plan_id,
                    title=title,
                    rationale=rationale,
                    steps=_steps(
                        plan_id,
                        [
                            {
                                "description": f"For “{goal}”: {first_action}",
                                "action_type": "planning",
                                "resources": ["note writer", "30 minutes"],
                                "feedback_signal": "A concrete artifact and open questions are recorded.",
                                "estimated_effort": 0.5,
                            },
                            {
                                "description": (
                                    "Take the smallest action supported by the new evidence "
                                    "and record its result."
                                ),
                                "action_type": "experiment",
                                "feedback_signal": "The action has an observable result.",
                                "estimated_effort": 1.0,
                            },
                            {
                                "description": (
                                    "Compare the result with the success definition and choose "
                                    "whether to continue, revise, or stop."
                                ),
                                "action_type": "reflection",
                                "feedback_signal": "A continue, revise, or stop decision is recorded.",
                                "estimated_effort": 0.25,
                            },
                        ],
                    ),
                    assumptions=["The goal has at least one reversible first move."],
                    predicted_risks=["The initial success definition may omit a hidden constraint."],
                    tags=[tag, "feedback", "reversible"],
                )
            )
        return plans


# The deterministic templates live on the model-assisted class only because the
# two backends share their plan-shaping helpers. Expose them on the lightweight
# heuristic backend as well so it remains a fully independent offline fallback.
HeuristicPlanner._learning_plans = OllamaPlannerBackend._learning_plans  # type: ignore[attr-defined]
HeuristicPlanner._building_plans = OllamaPlannerBackend._building_plans  # type: ignore[attr-defined]
HeuristicPlanner._general_plans = OllamaPlannerBackend._general_plans  # type: ignore[attr-defined]
