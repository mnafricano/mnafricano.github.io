from cognitive_multiplexer.models import Candidate
from cognitive_multiplexer.working_memory import WorkingMemory


def test_working_memory_tracks_state():
    memory = WorkingMemory(session_id="test")
    memory.active_goal = "Answer the user"
    memory.add_fact("Fact A")
    memory.add_fact("Fact A")
    memory.add_constraint("Be concise")
    memory.add_open_question("Need more detail?")
    memory.add_candidate(Candidate(kind="single", content="Candidate"))
    memory.add_verification_note("Looks fine")

    summary = memory.summarize()

    assert summary.active_goal == "Answer the user"
    assert summary.known_facts == ["Fact A"]
    assert summary.important_constraints == ["Be concise"]
    assert summary.open_questions == ["Need more detail?"]
    assert summary.candidate_count == 1
    assert summary.verification_notes == ["Looks fine"]
