"""Command line interface for Cognitive Multiplexer."""

from __future__ import annotations

import argparse
import json

from cognitive_multiplexer.controller import CognitiveController


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a Cognitive Multiplexer cycle.")
    parser.add_argument("input", help="User message to process")
    parser.add_argument("--session-id", default=None, help="Optional session id")
    parser.add_argument(
        "--compute-budget",
        choices=["low", "medium", "high"],
        default="medium",
        help="Adaptive compute level for the cognitive cycle",
    )
    parser.add_argument("--trace", action="store_true", help="Print the full JSON trace")
    args = parser.parse_args()

    result = CognitiveController().run(
        args.input,
        session_id=args.session_id,
        compute_budget=args.compute_budget,
    )
    print(result.answer)
    if args.trace:
        print("\nTRACE:")
        print(json.dumps(result.trace.model_dump(mode="json"), indent=2))


if __name__ == "__main__":
    main()
