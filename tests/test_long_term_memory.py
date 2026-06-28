from cognitive_multiplexer.long_term_memory import LongTermMemory
from cognitive_multiplexer.models import MemoryRecord
from cognitive_multiplexer.perception import PerceptionModule


def test_long_term_memory_retrieves_by_keyword_and_tag(tmp_path):
    store = LongTermMemory(tmp_path / "memory.json")
    store.add(
        MemoryRecord(
            text="User prefers weekly plans with three priorities.",
            type="preference",
            source="test",
            confidence=0.9,
            tags=["planning"],
        )
    )

    results = store.retrieve("plan my weekly priorities", tags=["planning"])

    assert len(results) == 1
    assert results[0].record.type == "preference"
    assert results[0].score > 0


def test_memory_write_gate_requires_explicit_memory_intent(tmp_path):
    store = LongTermMemory(tmp_path / "memory.json")
    perception = PerceptionModule().perceive("Remember that I like concise answers.")

    assert store.should_write("Remember that I like concise answers.", "Noted.", perception)
