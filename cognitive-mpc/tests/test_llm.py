from __future__ import annotations

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from core.llm import OllamaLanguageModel


class FakeOllamaHandler(BaseHTTPRequestHandler):
    last_payload = {}

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/api/tags":
            self.send_error(404)
            return
        self.send_json({"models": [{"name": "gemma3:test"}]})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/chat":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        type(self).last_payload = json.loads(self.rfile.read(length))
        self.send_json(
            {
                "model": "gemma3:test",
                "message": {
                    "role": "assistant",
                    "content": "A genuinely generated local response.",
                },
                "done": True,
                "done_reason": "stop",
                "prompt_eval_count": 42,
                "eval_count": 8,
            }
        )

    def send_json(self, payload) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args) -> None:
        return


class RichFakeOllamaHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        self.send_json({"models": [{"name": "qwen3:8b"}]})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length))
        if self.path == "/api/embed":
            self.send_json(
                {
                    "model": "qwen3:8b",
                    "embeddings": [[0.1, 0.2] for _ in payload["input"]],
                }
            )
            return
        if payload.get("stream"):
            chunks = [
                {
                    "model": "qwen3:8b",
                    "message": {"role": "assistant", "content": "Hello "},
                    "done": False,
                },
                {
                    "model": "qwen3:8b",
                    "message": {"role": "assistant", "content": "locally."},
                    "done": True,
                    "done_reason": "stop",
                    "eval_count": 2,
                },
            ]
            encoded = b"".join(
                json.dumps(chunk).encode() + b"\n" for chunk in chunks
            )
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
            return
        if payload.get("tools"):
            self.send_json(
                {
                    "model": "qwen3:8b",
                    "message": {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [
                            {
                                "function": {
                                    "name": "calculator",
                                    "arguments": {"expression": "6 * 7"},
                                }
                            }
                        ],
                    },
                    "done": True,
                }
            )
            return
        self.send_json(
            {
                "model": "qwen3:8b",
                "message": {
                    "role": "assistant",
                    "content": json.dumps({"intent": "goal", "confidence": 0.9}),
                },
                "done": True,
            }
        )

    def send_json(self, payload) -> None:
        encoded = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args) -> None:
        return


class OllamaLanguageModelTests(unittest.TestCase):
    def test_discovers_model_and_generates_non_streaming_chat(self) -> None:
        server = ThreadingHTTPServer(("127.0.0.1", 0), FakeOllamaHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            model = OllamaLanguageModel(
                base_url=f"http://127.0.0.1:{server.server_address[1]}",
                timeout=3,
            )
            status = model.status()
            response = model.generate(
                [
                    {"role": "system", "content": "Stay grounded."},
                    {"role": "user", "content": "Create the selected artifact."},
                ]
            )
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)

        self.assertTrue(status.available)
        self.assertEqual(status.model, "gemma3:test")
        self.assertIn("genuinely generated", response.content)
        self.assertFalse(FakeOllamaHandler.last_payload["stream"])
        self.assertFalse(FakeOllamaHandler.last_payload["think"])

    def test_unavailable_server_reports_template_mode(self) -> None:
        model = OllamaLanguageModel(
            base_url="http://127.0.0.1:1",
            timeout=0.1,
        )
        status = model.status(force=True)
        self.assertFalse(status.available)
        self.assertEqual(status.mode, "template")

    def test_structured_tools_streaming_and_embedding_interfaces(self) -> None:
        server = ThreadingHTTPServer(("127.0.0.1", 0), RichFakeOllamaHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            model = OllamaLanguageModel(
                base_url=f"http://127.0.0.1:{server.server_address[1]}",
                model="qwen3:8b",
                timeout=3,
            )
            structured = model.structured(
                [{"role": "user", "content": "route"}],
                {"type": "object"},
            )
            tool_response = model.complete(
                [{"role": "user", "content": "calculate"}],
                tools=[{"type": "function", "function": {"name": "calculator"}}],
            )
            chunks = list(
                model.stream([{"role": "user", "content": "stream"}])
            )
            embedded = model.embed(["one", "two"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)

        self.assertEqual(structured["intent"], "goal")
        self.assertEqual(tool_response.tool_calls[0].name, "calculator")
        self.assertEqual(
            "".join(
                chunk.get("content", "")
                for chunk in chunks
                if chunk["type"] == "token"
            ),
            "Hello locally.",
        )
        self.assertEqual(len(embedded["embeddings"]), 2)

    def test_model_tool_calls_are_capped_at_four(self) -> None:
        raw = [
            {
                "function": {
                    "name": "calculator",
                    "arguments": {"expression": str(index)},
                }
            }
            for index in range(8)
        ]
        self.assertEqual(len(OllamaLanguageModel._parse_tool_calls(raw)), 4)


if __name__ == "__main__":
    unittest.main()
