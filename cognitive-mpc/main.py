#!/usr/bin/env python3
"""Interactive command-line entrypoint for the Cognitive MPC prototype."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional, Sequence

from core.controller import CognitiveController, CycleResult


PROJECT_ROOT = Path(__file__).resolve().parent


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the local, inspectable Cognitive MPC control loop."
    )
    parser.add_argument(
        "--web",
        action="store_true",
        help="Launch the browser-based chat interface instead of the terminal UI.",
    )
    parser.add_argument("--goal", help="Start directly with this goal.")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run one cycle and exit (useful for scripts and demos).",
    )
    parser.add_argument(
        "--state",
        type=Path,
        default=PROJECT_ROOT / "data" / "world_state.json",
        help="World-state JSON path.",
    )
    parser.add_argument(
        "--memory",
        type=Path,
        default=PROJECT_ROOT / "data" / "memory.json",
        help="Memory JSON path.",
    )
    parser.add_argument(
        "--log",
        type=Path,
        default=PROJECT_ROOT / "logs" / "cycles.jsonl",
        help="Append-only cycle log path.",
    )
    parser.add_argument(
        "--enable-shell",
        action="store_true",
        help="Permit shell tool calls. Disabled by default.",
    )
    parser.add_argument(
        "--enable-note-writer",
        action="store_true",
        help="Permit the note-writer tool to modify workspace files.",
    )
    return parser


def _score_line(result: CycleResult) -> None:
    print("\nCandidate plans")
    print("-" * 88)
    for index, candidate in enumerate(result.candidates, start=1):
        simulation = candidate.simulation
        verification = candidate.verification
        status = "PASS" if verification.passed else "FAIL"
        print(f"{index}. {candidate.plan.title} [{status}]")
        print(f"   {candidate.plan.rationale}")
        print(
            "   score "
            f"{candidate.adjusted_score:>5.2f} = benefit {simulation.likely_benefit:.2f} "
            f"+ compound {simulation.compounding_value:.2f} "
            f"+ reversible {simulation.reversibility:.2f} "
            f"- cost {simulation.likely_cost:.2f} - risk {simulation.risk:.2f} "
            f"- uncertainty {simulation.uncertainty:.2f} "
            f"- verifier/history {verification.penalty + candidate.history_penalty:.2f}"
        )
        print(f"   assumptions: {'; '.join(candidate.plan.assumptions)}")
        print(f"   predicted risks: {'; '.join(candidate.plan.predicted_risks)}")
        if verification.warnings:
            print(f"   warnings: {'; '.join(verification.warnings)}")
        if verification.errors:
            print(f"   errors: {'; '.join(verification.errors)}")
        if candidate.next_step:
            print(f"   available next step: {candidate.next_step.description}")
        else:
            print("   available next step: none in this horizon")


def print_result(result: CycleResult) -> None:
    _score_line(result)
    decision = result.decision
    print("\nChosen next action")
    print("-" * 88)
    print(f"Plan: {decision.plan_title}")
    print(f"Action: {decision.step.description}")
    print(f"Why: {decision.reason}")
    print(f"Feedback expected: {decision.step.feedback_signal}")
    print(f"Status: {decision.execution_status} (task {decision.task_id})")

    update = result.memory_update
    print("\nMemory update")
    print("-" * 88)
    print(f"Decision episode: {update['decision_memory_id']}")
    if update.get("observation_memory_id"):
        print(f"Observation episode: {update['observation_memory_id']}")
    consolidated = update.get("consolidation", {})
    semantic_count = len(consolidated.get("semantic", []))
    procedural_count = len(consolidated.get("procedural", []))
    if semantic_count or procedural_count:
        print(
            f"Consolidated: {semantic_count} semantic, "
            f"{procedural_count} procedural"
        )
    if update.get("replay_memory_id"):
        print(f"Replay summary: {update['replay_memory_id']}")
    process_names = ", ".join(
        process.process.value for process in result.scheduled_processes
    )
    print(f"Scheduler: {process_names}")


def _print_banner(controller: CognitiveController, args: argparse.Namespace) -> None:
    print("Cognitive MPC — local receding-horizon agent runtime")
    print("=" * 88)
    print(f"State:  {args.state}")
    print(f"Memory: {args.memory}")
    print(f"Logs:   {args.log}")
    shell_status = "enabled" if args.enable_shell else "disabled (default)"
    print(f"Shell tool: {shell_status}")
    print(
        "Commands at observation prompt: :state, :memories, :done, :quit\n"
    )


def _read(prompt: str) -> Optional[str]:
    try:
        return input(prompt)
    except (EOFError, KeyboardInterrupt):
        print()
        return None


def _run_goal(
    controller: CognitiveController,
    goal: str,
    *,
    once: bool,
) -> str:
    """Return ``new``, ``quit``, or ``finished``."""

    try:
        result = controller.run_cycle(goal)
    except ValueError as exc:
        # This normally means a prior run stopped while waiting for evidence.
        if once:
            print(f"Cannot run: {exc}", file=sys.stderr)
            return "finished"
        print(str(exc))
        observation = _read("Observation for the pending action> ")
        if observation is None:
            return "quit"
        if not observation.strip():
            return "new"
        result = controller.run_cycle(goal, observation)
    print_result(result)
    if once:
        return "finished"

    while True:
        observation = _read("\nObservation/result> ")
        if observation is None or observation.strip().casefold() == ":quit":
            return "quit"
        command = observation.strip().casefold()
        if command in {":done", ":new"}:
            return "new"
        if command == ":state":
            print(json.dumps(controller.state.snapshot(), indent=2, sort_keys=True))
            continue
        if command == ":memories":
            records = controller.memory.all_records[-10:]
            if not records:
                print("No memories yet.")
            for record in records:
                print(f"- [{record.kind}] {record.content}")
            continue
        if not observation.strip():
            print("Enter an observation, or use :done / :quit.")
            continue
        result = controller.run_cycle(goal, observation)
        print_result(result)


def main(argv: Optional[Sequence[str]] = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if "--web" in arguments:
        from web_server import main as web_main

        arguments.remove("--web")
        return web_main(arguments)

    args = build_parser().parse_args(arguments)
    controller = CognitiveController.from_paths(
        args.state,
        args.memory,
        args.log,
        workspace=PROJECT_ROOT,
        enable_shell=args.enable_shell,
        enable_note_writer=args.enable_note_writer,
    )
    _print_banner(controller, args)

    if args.goal:
        _run_goal(controller, args.goal, once=args.once)
        return 0

    while True:
        goal = _read("Goal> ")
        if goal is None or goal.strip().casefold() in {":quit", "quit", "exit"}:
            return 0
        if not goal.strip():
            continue
        outcome = _run_goal(controller, goal, once=args.once)
        if outcome in {"quit", "finished"}:
            return 0


if __name__ == "__main__":
    raise SystemExit(main())
