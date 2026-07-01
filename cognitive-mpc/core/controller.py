"""The receding-horizon Cognitive MPC control loop."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from .logging import StructuredLogger
from .memory import MemoryStore
from .planner import CandidatePlan, HeuristicPlanner, PlanStep, PlannerBackend
from .replay import MemoryReplay, ReplaySummary
from .scheduler import CognitiveProcess, CognitiveScheduler, ScheduledProcess
from .state import Goal, WorldState
from .tools import ToolRegistry, ToolResult
from .verifier import RuleBasedVerifier, VerificationResult
from .world_model import HeuristicWorldModel, SimulationResult


@dataclass
class CandidateEvaluation:
    """A plan, its simulated trajectory, and its verification-adjusted utility."""

    plan: CandidatePlan
    simulation: SimulationResult
    verification: VerificationResult
    history_penalty: float
    adjusted_score: float
    next_step: Optional[PlanStep]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "plan": self.plan.to_dict(),
            "simulation": self.simulation.to_dict(),
            "verification": self.verification.to_dict(),
            "history_penalty": self.history_penalty,
            "adjusted_score": self.adjusted_score,
            "next_step": self.next_step.to_dict() if self.next_step else None,
        }


@dataclass
class ActionDecision:
    plan_id: str
    plan_title: str
    step: PlanStep
    adjusted_score: float
    reason: str
    task_id: str
    execution_status: str = "awaiting_observation"

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["step"] = self.step.to_dict()
        return payload


@dataclass
class CycleResult:
    cycle_number: int
    goal: Goal
    observation_outcome: Optional[str]
    scheduled_processes: List[ScheduledProcess]
    candidates: List[CandidateEvaluation]
    decision: ActionDecision
    memory_update: Dict[str, Any]
    replay_summary: Optional[ReplaySummary] = None
    planning_metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "cycle_number": self.cycle_number,
            "goal": asdict(self.goal),
            "observation_outcome": self.observation_outcome,
            "scheduled_processes": [
                process.to_dict() for process in self.scheduled_processes
            ],
            "candidates": [candidate.to_dict() for candidate in self.candidates],
            "decision": self.decision.to_dict(),
            "memory_update": self.memory_update,
            "replay_summary": (
                self.replay_summary.to_dict() if self.replay_summary else None
            ),
            "planning_metadata": self.planning_metadata,
        }


class CognitiveController:
    """Observe, replan, simulate, verify, choose one action, and remember."""

    FAILURE_TERMS = {
        "failed",
        "failure",
        "blocked",
        "error",
        "couldn't",
        "cannot",
        "didn't work",
        "stuck",
    }
    SUCCESS_TERMS = {
        "succeeded",
        "success",
        "worked",
        "completed",
        "done",
        "passed",
        "finished",
    }

    def __init__(
        self,
        *,
        state: Optional[WorldState] = None,
        memory: Optional[MemoryStore] = None,
        planner: Optional[PlannerBackend] = None,
        world_model: Optional[HeuristicWorldModel] = None,
        verifier: Optional[RuleBasedVerifier] = None,
        scheduler: Optional[CognitiveScheduler] = None,
        replay: Optional[MemoryReplay] = None,
        logger: Optional[StructuredLogger] = None,
        tools: Optional[ToolRegistry] = None,
        state_path: Optional[Path | str] = None,
        memory_path: Optional[Path | str] = None,
    ) -> None:
        self.state = state or WorldState()
        self.memory = memory or MemoryStore()
        self.planner = planner or HeuristicPlanner()
        self.world_model = world_model or HeuristicWorldModel()
        self.verifier = verifier or RuleBasedVerifier()
        self.scheduler = scheduler or CognitiveScheduler()
        self.replay = replay or MemoryReplay()
        self.logger = logger
        self.state_path = Path(state_path) if state_path else None
        self.memory_path = Path(memory_path) if memory_path else None
        self.tools = tools or ToolRegistry(
            Path.cwd(),
            permissions={
                "run_shell": bool(self.state.environment_facts.get("shell_enabled", False))
            },
            audit_callback=self.logger.log if self.logger else None,
        )

    @classmethod
    def from_paths(
        cls,
        state_path: Path | str,
        memory_path: Path | str,
        log_path: Path | str,
        *,
        workspace: Optional[Path | str] = None,
        enable_shell: bool = False,
        enable_note_writer: bool = False,
        planner: Optional[PlannerBackend] = None,
    ) -> "CognitiveController":
        state = WorldState.load(state_path)
        memory = MemoryStore.load(memory_path)
        state.environment_facts["shell_enabled"] = enable_shell
        logger = StructuredLogger(log_path)
        tools = ToolRegistry(
            workspace or Path.cwd(),
            permissions={
                "run_shell": enable_shell,
                "write_notes": enable_note_writer,
            },
            audit_callback=logger.log,
        )
        return cls(
            state=state,
            memory=memory,
            planner=planner,
            logger=logger,
            tools=tools,
            state_path=state_path,
            memory_path=memory_path,
        )

    def run_cycle(self, goal_text: str, observation: Optional[str] = None) -> CycleResult:
        """Run one complete receding-horizon decision cycle.

        If the same goal already has an action awaiting evidence, callers must
        provide an observation. This prevents the controller from racing ahead
        and pretending that an unobserved action succeeded.
        """

        goal = self.state.add_goal(goal_text)
        pending = self.state.latest_pending_task(goal.id)
        if pending and not (observation and observation.strip()):
            raise ValueError(
                f"Action {pending.id} is awaiting an observation before replanning."
            )

        observation_outcome: Optional[str] = None
        observation_memory_id: Optional[str] = None
        if observation and observation.strip():
            observation_outcome = self._classify_outcome(observation)
            surprise = self._estimate_surprise(observation)
            related_task_id = pending.id if pending else None
            if pending:
                self.state.resolve_task(pending.id, observation, observation_outcome)
            observed = self.state.record_observation(
                observation,
                outcome=observation_outcome,
                related_task_id=related_task_id,
                surprise=surprise,
            )
            metadata = self._observation_metadata(
                observation,
                observation_outcome,
                surprise,
                pending.description if pending else "",
                pending.source_plan_id if pending else "",
            )
            episode = self.memory.add_episodic(
                f"Observation for “{goal.text}”: {observed.content}",
                tags=["observation", observation_outcome],
                metadata=metadata,
                importance=0.8 if observation_outcome != "neutral" else 0.6,
            )
            observation_memory_id = episode.id
            self._reflect_on_observation(goal, observation_outcome)

        self.state.cycle_count += 1
        cycle_number = self.state.cycle_count
        scheduled = self.scheduler.schedule(
            cycle_number,
            observation_outcome=observation_outcome,
            episodic_count=len(self.memory.episodic),
        )

        retrieved = self.memory.search(
            goal.text, kinds=["semantic", "procedural"], limit=6
        )
        memory_context = [record.content for record in retrieved]
        plans = self.planner.generate(goal.text, self.state, memory_context)
        planning_metadata = dict(
            getattr(self.planner, "last_metadata", {"source": "heuristic"})
        )
        candidates = [self._evaluate_plan(plan, goal) for plan in plans]
        selected = self._choose_candidate(candidates)
        next_step = selected.next_step or self._fallback_step(selected.plan)

        reason = self._selection_reason(selected, candidates)
        task = self.state.add_task(
            goal_id=goal.id,
            description=next_step.description,
            source_plan_id=selected.plan.id,
        )
        decision = ActionDecision(
            plan_id=selected.plan.id,
            plan_title=selected.plan.title,
            step=next_step,
            adjusted_score=selected.adjusted_score,
            reason=reason,
            task_id=task.id,
        )

        decision_memory = self.memory.add_episodic(
            (
                f"Cycle {cycle_number} selected “{selected.plan.title}”; next action: "
                f"{next_step.description}"
            ),
            tags=["decision", "planning", *selected.plan.tags],
            metadata={
                "pattern_key": f"decision:{selected.plan.title.casefold()}",
                "semantic_summary": (
                    f"The controller repeatedly favors {selected.plan.title.casefold()} "
                    "when its feedback and reversibility outweigh cost and risk."
                ),
                "plan_id": selected.plan.id,
                "score": selected.adjusted_score,
                "outcome": "proposed",
            },
            importance=0.7,
        )

        memory_update: Dict[str, Any] = {
            "observation_memory_id": observation_memory_id,
            "decision_memory_id": decision_memory.id,
            "consolidation": {"semantic": [], "procedural": []},
            "replay_memory_id": None,
        }
        replay_summary: Optional[ReplaySummary] = None

        for process in scheduled:
            if process.process == CognitiveProcess.CONSOLIDATION:
                consolidated = self.memory.consolidate()
                memory_update["consolidation"] = consolidated
                self._promote_consolidated_beliefs(consolidated.get("semantic", []))
            elif process.process == CognitiveProcess.REPLAY:
                replay_summary = self.replay.review(self.memory)
                memory_update["replay_memory_id"] = replay_summary.memory_id

        self.state.touch()
        self._save()
        self._log_cycle(
            goal=goal,
            scheduled=scheduled,
            candidates=candidates,
            decision=decision,
            memory_update=memory_update,
            observation=observation,
            observation_outcome=observation_outcome,
            replay_summary=replay_summary,
        )

        return CycleResult(
            cycle_number=cycle_number,
            goal=goal,
            observation_outcome=observation_outcome,
            scheduled_processes=scheduled,
            candidates=candidates,
            decision=decision,
            memory_update=memory_update,
            replay_summary=replay_summary,
            planning_metadata=planning_metadata,
        )

    def call_tool(self, name: str, arguments: Dict[str, Any]) -> ToolResult:
        """Expose the permission-gated tool bus to future planners and plugins."""

        return self.tools.call(name, arguments)

    def _evaluate_plan(self, plan: CandidatePlan, goal: Goal) -> CandidateEvaluation:
        simulation = self.world_model.simulate(plan, self.state)
        verification = self.verifier.verify(plan, self.state)
        related_tasks = [
            task
            for task in self.state.active_tasks
            if task.goal_id == goal.id and task.source_plan_id == plan.id
        ]
        history_penalty = round(
            sum(
                3.0 if task.status == "failed" else 0.15
                for task in related_tasks
                if task.status in {"failed", "completed"}
            ),
            2,
        )
        next_step = self._next_untried_step(plan, related_tasks)
        if next_step is None:
            history_penalty += 2.0
        adjusted = round(
            simulation.score - verification.penalty - history_penalty, 2
        )
        return CandidateEvaluation(
            plan=plan,
            simulation=simulation,
            verification=verification,
            history_penalty=history_penalty,
            adjusted_score=adjusted,
            next_step=next_step,
        )

    @staticmethod
    def _next_untried_step(
        plan: CandidatePlan, related_tasks: Sequence[Any]
    ) -> Optional[PlanStep]:
        # A failure invalidates this trajectory for the current horizon. The
        # controller should compare other plans rather than jump past a failed
        # prerequisite inside the same plan.
        if any(task.status == "failed" for task in related_tasks):
            return None
        attempted = {task.description for task in related_tasks}
        return next(
            (step for step in plan.steps if step.description not in attempted),
            None,
        )

    @staticmethod
    def _choose_candidate(
        candidates: Sequence[CandidateEvaluation],
    ) -> CandidateEvaluation:
        feasible = [
            candidate
            for candidate in candidates
            if candidate.verification.passed and candidate.next_step is not None
        ]
        pool = feasible or [
            candidate for candidate in candidates if candidate.next_step is not None
        ]
        pool = pool or list(candidates)
        if not pool:
            raise RuntimeError("Planner returned no candidate plans.")
        return max(pool, key=lambda item: (item.adjusted_score, item.plan.title))

    @staticmethod
    def _fallback_step(plan: CandidatePlan) -> PlanStep:
        return PlanStep(
            id=f"{plan.id}_reassessment",
            description=(
                "Review accumulated evidence, revise the goal horizon, and define one "
                "new reversible action with an observable result."
            ),
            action_type="reflection",
            resources=["note writer", "20 minutes"],
            feedback_signal="A revised horizon and one new testable action are recorded.",
            estimated_effort=0.33,
        )

    @staticmethod
    def _selection_reason(
        selected: CandidateEvaluation,
        candidates: Sequence[CandidateEvaluation],
    ) -> str:
        second_best = sorted(
            (candidate.adjusted_score for candidate in candidates),
            reverse=True,
        )[1] if len(candidates) > 1 else selected.adjusted_score
        simulation = selected.simulation
        return (
            f"Highest feasible adjusted utility ({selected.adjusted_score:.2f}, "
            f"{selected.adjusted_score - second_best:+.2f} versus the next candidate). "
            f"Raw score {simulation.score:.2f} = benefit "
            f"{simulation.likely_benefit:.2f} + compounding "
            f"{simulation.compounding_value:.2f} + reversibility "
            f"{simulation.reversibility:.2f} - cost {simulation.likely_cost:.2f} "
            f"- risk {simulation.risk:.2f} - uncertainty "
            f"{simulation.uncertainty:.2f}; verification/history penalty "
            f"{selected.verification.penalty + selected.history_penalty:.2f}."
        )

    @classmethod
    def _classify_outcome(cls, observation: str) -> str:
        lowered = observation.casefold()
        if any(term in lowered for term in cls.FAILURE_TERMS):
            return "failure"
        if any(term in lowered for term in cls.SUCCESS_TERMS):
            return "success"
        return "neutral"

    @staticmethod
    def _estimate_surprise(observation: str) -> float:
        lowered = observation.casefold()
        markers = ("unexpected", "surprised", "different than expected", "suddenly")
        return 0.8 if any(marker in lowered for marker in markers) else 0.2

    @staticmethod
    def _observation_metadata(
        observation: str,
        outcome: str,
        surprise: float,
        action: str,
        plan_id: str,
    ) -> Dict[str, Any]:
        lowered = observation.casefold()
        practical_markers = ("hands-on", "practical", "lab", "applied project")
        metadata: Dict[str, Any] = {
            "outcome": outcome,
            "surprise": surprise,
            "action": action,
            "plan_id": plan_id,
        }
        if any(marker in lowered for marker in practical_markers):
            metadata.update(
                {
                    "pattern_key": "preference:applied-learning",
                    "semantic_summary": (
                        "User learns best through applied projects, practical labs, "
                        "and concrete feedback."
                    ),
                }
            )
        elif outcome == "success" and action:
            normalized_action = re.sub(r"[^a-z0-9]+", "-", action.casefold()).strip("-")
            metadata.update(
                {
                    "pattern_key": f"successful-action:{plan_id or normalized_action[:40]}",
                    "semantic_summary": (
                        f"A successful strategy for similar goals is: {action}"
                    ),
                    "procedural_candidate": (
                        f"For similar goals, begin with this proven action pattern: {action}"
                    ),
                }
            )
        else:
            compact = re.sub(r"\s+", " ", observation.casefold()).strip()
            metadata["pattern_key"] = f"observation:{compact[:80]}"
        return metadata

    def _reflect_on_observation(self, goal: Goal, outcome: str) -> None:
        current = self.state.uncertainty.get(goal.id, 0.5)
        if outcome == "success":
            current -= 0.08
        elif outcome == "failure":
            current += 0.12
        else:
            current += 0.01
        self.state.uncertainty[goal.id] = round(max(0.0, min(1.0, current)), 3)

    def _promote_consolidated_beliefs(self, semantic_ids: Sequence[str]) -> None:
        by_id = {record.id: record for record in self.memory.semantic}
        for memory_id in semantic_ids:
            record = by_id.get(memory_id)
            if not record:
                continue
            pattern_key = str(record.metadata.get("pattern_key", record.id))
            self.state.update_belief(
                pattern_key,
                record.content,
                confidence_delta=min(
                    0.25, 0.03 * int(record.metadata.get("evidence_count", 1))
                ),
            )

    def _save(self) -> None:
        if self.state_path:
            self.state.save(self.state_path)
        if self.memory_path:
            self.memory.save(self.memory_path)

    def _log_cycle(
        self,
        *,
        goal: Goal,
        scheduled: Sequence[ScheduledProcess],
        candidates: Sequence[CandidateEvaluation],
        decision: ActionDecision,
        memory_update: Dict[str, Any],
        observation: Optional[str],
        observation_outcome: Optional[str],
        replay_summary: Optional[ReplaySummary],
    ) -> None:
        if not self.logger:
            return
        self.logger.log_cycle(
            {
                "cycle_number": self.state.cycle_count,
                "goal": asdict(goal),
                "observation": observation,
                "observation_outcome": observation_outcome,
                "state_snapshot": self.state.snapshot(),
                "scheduled_processes": [
                    process.to_dict() for process in scheduled
                ],
                "candidate_plans": [
                    candidate.plan.to_dict() for candidate in candidates
                ],
                "simulations": [
                    candidate.simulation.to_dict() for candidate in candidates
                ],
                "verification": [
                    candidate.verification.to_dict() for candidate in candidates
                ],
                "candidate_adjusted_scores": {
                    candidate.plan.id: candidate.adjusted_score
                    for candidate in candidates
                },
                "planning_backend": dict(
                    getattr(self.planner, "last_metadata", {"source": "heuristic"})
                ),
                "selected_action": decision.to_dict(),
                "memory_update": memory_update,
                "replay_summary": (
                    replay_summary.to_dict() if replay_summary else None
                ),
            }
        )
