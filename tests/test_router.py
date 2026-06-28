from cognitive_multiplexer.expert_router import ExpertRouter
from cognitive_multiplexer.perception import PerceptionModule
from cognitive_multiplexer.working_memory import WorkingMemory


def test_router_selects_coding_and_verification_experts():
    perception = PerceptionModule().perceive("Write a Python function to deduplicate dictionaries by id.")
    plan = ExpertRouter().route(perception, WorkingMemory())
    names = {selection.name for selection in plan.selected_experts}

    assert "CodingExpert" in names
    assert "VerificationExpert" in names


def test_router_selects_safety_for_high_stakes_planning():
    perception = PerceptionModule().perceive("Help me decide whether to quit my job and start a company.")
    plan = ExpertRouter().route(perception, WorkingMemory())
    names = {selection.name for selection in plan.selected_experts}

    assert "PlanningExpert" in names
    assert "SafetyExpert" in names
    assert "VerificationExpert" in names
