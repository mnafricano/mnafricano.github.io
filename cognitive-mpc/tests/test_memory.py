from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from core.memory import MemoryStore


class MemoryStoreTests(unittest.TestCase):
    def test_search_and_consolidation_create_semantic_and_procedural_memory(self) -> None:
        memory = MemoryStore()
        for day in range(3):
            memory.add_episodic(
                f"Day {day + 1}: practical lab succeeded.",
                tags=["learning", "lab"],
                metadata={
                    "pattern_key": "strategy:concept-plus-lab",
                    "semantic_summary": "Concept-plus-lab sessions improve retention.",
                    "procedural_candidate": (
                        "Pair one concept with one practical lab and a retrieval check."
                    ),
                    "outcome": "success",
                },
            )

        created = memory.consolidate(min_repetitions=3)

        self.assertEqual(len(created["semantic"]), 1)
        self.assertEqual(len(created["procedural"]), 1)
        self.assertIn("practical lab", memory.search("practical lab")[0].content)
        self.assertIn("improve retention", memory.semantic[0].content)

    def test_memory_round_trip(self) -> None:
        memory = MemoryStore()
        memory.add_semantic("TCP is connection-oriented.", tags=["networking"])
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "memory.json"
            memory.save(path)
            loaded = MemoryStore.load(path)
        self.assertEqual(loaded.semantic[0].content, "TCP is connection-oriented.")


if __name__ == "__main__":
    unittest.main()
