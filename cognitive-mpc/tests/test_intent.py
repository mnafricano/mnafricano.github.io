from __future__ import annotations

import unittest

from core.intent import IntentRouter


class IntentRouterTests(unittest.TestCase):
    def test_rules_distinguish_modes_and_preserve_ambiguity(self) -> None:
        router = IntentRouter()
        self.assertEqual(router.route("Learn TCP/IP.", has_pending_action=False).intent, "goal")
        self.assertEqual(router.route("Why this plan?", has_pending_action=True).intent, "question")
        self.assertEqual(
            router.route("The lab worked.", has_pending_action=True).intent,
            "observation",
        )
        self.assertEqual(
            router.route("calculate 12 * 8", has_pending_action=False).intent,
            "command",
        )
        ambiguous = router.route("Interesting.", has_pending_action=True)
        self.assertTrue(ambiguous.needs_confirmation)

    def test_manual_override_is_authoritative(self) -> None:
        decision = IntentRouter().route(
            "This could be anything.",
            has_pending_action=True,
            override="question",
        )
        self.assertEqual(decision.intent, "question")
        self.assertEqual(decision.confidence, 1.0)
        self.assertEqual(decision.source, "manual")


if __name__ == "__main__":
    unittest.main()
