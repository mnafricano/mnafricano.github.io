from cognitive_multiplexer.controller import CognitiveController
from cognitive_multiplexer.long_term_memory import LongTermMemory


def test_controller_runs_coding_cycle(tmp_path):
    controller = CognitiveController(long_term_memory=LongTermMemory(tmp_path / "memory.json"))

    result = controller.run("Write a Python function to deduplicate a list of dictionaries by id.")

    assert "```python" in result.answer
    assert result.trace.perception.task_type == "coding"
    assert any(item.name == "CodingExpert" for item in result.trace.routing_plan.selected_experts)
    assert result.trace.verification_scores


def test_controller_runs_high_stakes_planning_cycle(tmp_path):
    controller = CognitiveController(long_term_memory=LongTermMemory(tmp_path / "memory.json"))

    result = controller.run("Help me decide whether to quit my job and start a company.")

    assert result.trace.perception.estimated_stakes == "high"
    assert len(result.trace.candidate_summaries) == 3
    assert result.trace.compute_budget == "medium"
    assert result.answer.startswith("Cautious plan")
    assert "runway" in result.answer.lower()
    assert result.trace.memory_written is False


def test_controller_low_compute_budget_generates_one_candidate(tmp_path):
    controller = CognitiveController(long_term_memory=LongTermMemory(tmp_path / "memory.json"))

    result = controller.run(
        "Help me decide whether to quit my job and start a company.",
        compute_budget="low",
    )

    assert result.trace.compute_budget == "low"
    assert len(result.trace.candidate_summaries) == 1


def test_controller_retrieves_relevant_memory(tmp_path):
    store = LongTermMemory(tmp_path / "memory.json")
    controller = CognitiveController(long_term_memory=store)
    controller.run("Remember that I prefer weekly planning with three priorities.")

    result = controller.run("How should I plan my week?")

    assert result.trace.memory_written is False
    assert result.trace.retrieved_memories
    assert "three priorities" in result.trace.retrieved_memories[0].record.text


def test_controller_answers_general_how_to_question(tmp_path):
    controller = CognitiveController(long_term_memory=LongTermMemory(tmp_path / "memory.json"))

    result = controller.run("How to make a panini?", session_id="production", compute_budget="high")

    assert "panini" in result.answer.lower()
    assert "bread" in result.answer.lower()
    assert "cheese" in result.answer.lower()
    assert "Break the request into goal" not in result.answer
