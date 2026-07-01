from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from core.chat import CognitiveChatRuntime
from core.controller import CognitiveController
from core.logging import StructuredLogger
from core.llm import ModelResponse, ModelStatus
from core.memory import MemoryStore
from core.state import WorldState


class CognitiveChatRuntimeTests(unittest.TestCase):
    def build_runtime(self, root: Path) -> CognitiveChatRuntime:
        return CognitiveChatRuntime(
            CognitiveController(
                state=WorldState(),
                memory=MemoryStore(),
                logger=StructuredLogger(root / "cycles.jsonl"),
                state_path=root / "state.json",
                memory_path=root / "memory.json",
            ),
            root / "chat_history.json",
        )

    def test_messages_run_real_goal_and_observation_cycles(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            runtime = self.build_runtime(Path(temporary))

            first = runtime.send("Build a cybersecurity learning routine.")
            first_status = first["status"]
            self.assertEqual(first_status["composer_mode"], "observation")
            self.assertEqual(len(first["message"]["details"]["candidates"]), 3)
            self.assertIn("Next action", first["message"]["content"])

            first_action = first_status["pending_action"]["description"]
            second = runtime.send(
                "The action succeeded and the practical lab format worked."
            )
            second_status = second["status"]
            self.assertEqual(second["message"]["details"]["observation_outcome"], "success")
            self.assertNotEqual(
                first_action,
                second_status["pending_action"]["description"],
            )
            self.assertTrue((Path(temporary) / "chat_history.json").exists())

    def test_new_chat_preserves_prior_conversation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            runtime = self.build_runtime(Path(temporary))
            runtime.send("Learn networking fundamentals.")
            prior_id = runtime.status()["conversation"]["id"]

            status = runtime.new_conversation()

            self.assertEqual(len(status["conversations"]), 2)
            self.assertNotEqual(status["conversation"]["id"], prior_id)
            self.assertEqual(status["conversation"]["messages"], [])
            restored = runtime.switch_conversation(prior_id)
            self.assertTrue(restored["conversation"]["messages"])

    def test_existing_pending_terminal_action_is_recovered(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            state = WorldState()
            goal = state.add_goal("Learn networking.")
            task = state.add_task(goal.id, "Map the local network.", "plan_example")
            controller = CognitiveController(state=state, memory=MemoryStore())

            runtime = CognitiveChatRuntime(controller, root / "history.json")
            status = runtime.status()

            self.assertEqual(status["current_goal"]["id"], goal.id)
            self.assertEqual(status["pending_action"]["task_id"], task.id)
            self.assertIn(
                "recovered",
                status["conversation"]["messages"][0]["content"].casefold(),
            )

    def test_available_model_generates_grounded_response(self) -> None:
        class FakeLanguageModel:
            def __init__(self) -> None:
                self.messages = []

            def status(self, *, force: bool = False) -> ModelStatus:
                return ModelStatus(
                    available=True,
                    provider="test",
                    model="grounded-model",
                    mode="generative",
                    detail="Ready.",
                )

            def generate(self, messages):
                self.messages = list(messages)
                return ModelResponse(
                    content=(
                        "Here is a generated seven-day sprint grounded in the "
                        "selected MPC action."
                    ),
                    provider="test",
                    model="grounded-model",
                )

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            model = FakeLanguageModel()
            runtime = CognitiveChatRuntime(
                CognitiveController(state=WorldState(), memory=MemoryStore()),
                root / "history.json",
                language_model=model,
            )

            response = runtime.send("Learn networking fundamentals.")

            self.assertEqual(
                response["message"]["details"]["response_mode"],
                "generative",
            )
            self.assertIn("generated seven-day sprint", response["message"]["content"])
            self.assertIn(
                "Current verified Cognitive MPC decision context",
                model.messages[-1]["content"],
            )
            self.assertIn(
                response["message"]["details"]["selected_action"],
                model.messages[-1]["content"],
            )

    def test_question_does_not_complete_pending_action(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            runtime = self.build_runtime(Path(temporary))
            first = runtime.send("Learn networking fundamentals.")
            task_id = first["status"]["pending_action"]["task_id"]

            answer = runtime.send("Why was this action selected?", mode="question")

            self.assertEqual(answer["message"]["details"]["kind"], "question_answer")
            self.assertEqual(
                answer["status"]["pending_action"]["task_id"],
                task_id,
            )
            self.assertEqual(runtime.controller.state.cycle_count, 1)


if __name__ == "__main__":
    unittest.main()
