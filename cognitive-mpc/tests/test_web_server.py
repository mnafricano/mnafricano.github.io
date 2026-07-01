from __future__ import annotations

import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import Request, urlopen

from core.llm import DisabledLanguageModel
from web_server import create_server


class WebServerTests(unittest.TestCase):
    def test_health_static_page_and_chat_api(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            server = create_server(
                "127.0.0.1",
                0,
                state_path=root / "state.json",
                memory_path=root / "memory.json",
                log_path=root / "cycles.jsonl",
                history_path=root / "chat_history.json",
                workspace=root,
                language_model=DisabledLanguageModel(),
            )
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{server.server_address[1]}"
            try:
                with urlopen(f"{base}/api/health", timeout=3) as response:
                    health = json.load(response)
                self.assertTrue(health["ok"])

                with urlopen(base, timeout=3) as response:
                    html = response.read().decode("utf-8")
                self.assertIn("Cognitive MPC", html)

                request = Request(
                    f"{base}/api/chat",
                    data=json.dumps(
                        {"message": "Build a sustainable learning routine."}
                    ).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urlopen(request, timeout=3) as response:
                    payload = json.load(response)
                self.assertEqual(
                    payload["message"]["details"]["kind"],
                    "control_cycle",
                )
                self.assertEqual(
                    len(payload["message"]["details"]["candidates"]),
                    3,
                )
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
