"""Lightweight local demo server.

FastAPI remains the primary API implementation in api.py. This server exists
for local demos when importing the full FastAPI stack is slow on a machine.
"""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from cognitive_multiplexer.controller import CognitiveController


INDEX_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cognitive Multiplexer</title>
  <style>
    :root { color-scheme: dark; --bg:#0f1115; --panel:#181b22; --line:#333947; --text:#f4f0e8; --muted:#a7adba; --accent:#69d2c5; --soft:#20242d; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font-family:Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    main { width:min(1160px, calc(100vw - 32px)); margin:0 auto; padding:28px 0 44px; }
    h1 { margin:0 0 8px; font-size:clamp(2rem, 5vw, 4rem); letter-spacing:0; }
    p { color:var(--muted); line-height:1.5; }
    .grid { display:grid; grid-template-columns:minmax(0,420px) minmax(0,1fr); gap:16px; align-items:start; }
    section { border:1px solid var(--line); border-radius:8px; background:var(--panel); padding:16px; }
    label { display:block; color:var(--muted); margin:12px 0 8px; }
    textarea, input, select, button { width:100%; border:1px solid var(--line); border-radius:8px; background:#10131a; color:var(--text); font:inherit; }
    textarea { min-height:160px; padding:12px; resize:vertical; line-height:1.45; }
    input, select { padding:10px 12px; }
    button { margin-top:12px; padding:13px 14px; border-color:transparent; background:var(--accent); color:#06110f; font-weight:800; cursor:pointer; }
    button:disabled { opacity:.65; cursor:wait; }
    .row { display:grid; grid-template-columns:1fr 150px; gap:10px; }
    .answer { white-space:pre-wrap; line-height:1.55; min-height:120px; }
    .channels { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:14px; }
    .channel { border:1px solid var(--line); border-radius:8px; background:var(--soft); padding:12px; min-height:78px; }
    .channel b { display:block; color:var(--accent); margin-bottom:6px; }
    .channel span { color:var(--muted); }
    pre { overflow:auto; max-height:440px; padding:12px; background:#10131a; border:1px solid var(--line); border-radius:8px; }
    @media (max-width: 860px) { .grid,.channels,.row { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>Cognitive Multiplexer</h1>
    <p>A modular AI runtime that routes prompts through perception, memory, experts, candidate generation, verification, and final response.</p>
    <div class="grid">
      <section>
        <h2>Run A Cognitive Cycle</h2>
        <label for="input">Input</label>
        <textarea id="input">How to make a panini?</textarea>
        <div class="row">
          <div><label for="session">Session</label><input id="session" value="production" /></div>
          <div><label for="budget">Compute</label><select id="budget"><option>low</option><option selected>medium</option><option>high</option></select></div>
        </div>
        <button id="run">Run Multiplexer</button>
      </section>
      <section>
        <h2>Final Answer</h2>
        <div id="answer" class="answer">Ask something and run the cognitive cycle.</div>
        <div class="channels">
          <div class="channel"><b>Goal</b><span id="goal">Waiting.</span></div>
          <div class="channel"><b>Memory</b><span id="memory">Waiting.</span></div>
          <div class="channel"><b>Experts</b><span id="experts">Waiting.</span></div>
          <div class="channel"><b>Candidates</b><span id="candidates">Waiting.</span></div>
          <div class="channel"><b>Verification</b><span id="verification">Waiting.</span></div>
          <div class="channel"><b>Write</b><span id="write">Waiting.</span></div>
        </div>
        <h2>JSON Trace</h2>
        <pre id="trace">{}</pre>
      </section>
    </div>
  </main>
  <script>
    const $ = (id) => document.getElementById(id);
    async function runCycle() {
      $("run").disabled = true;
      $("run").textContent = "Running...";
      try {
        const response = await fetch("/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: $("input").value, session_id: $("session").value, compute_budget: $("budget").value })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const trace = payload.trace;
        $("answer").textContent = payload.answer;
        $("goal").textContent = `${trace.perception.task_type} · ${trace.perception.estimated_stakes}`;
        $("memory").textContent = `${trace.retrieved_memories.length} retrieved`;
        $("experts").textContent = trace.routing_plan.selected_experts.map((item) => item.name.replace("Expert", "")).join(", ");
        $("candidates").textContent = `${trace.candidate_summaries.length} · ${trace.compute_budget}`;
        $("verification").textContent = trace.verification_scores.map((item) => item.score).join(", ");
        $("write").textContent = trace.memory_written ? "written" : "not written";
        $("trace").textContent = JSON.stringify(trace, null, 2);
      } catch (error) {
        $("answer").textContent = `Request failed: ${error.message}`;
      } finally {
        $("run").disabled = false;
        $("run").textContent = "Run Multiplexer";
      }
    }
    $("run").addEventListener("click", runCycle);
  </script>
</body>
</html>"""


class DemoHandler(BaseHTTPRequestHandler):
    controller = CognitiveController()

    def do_GET(self) -> None:
        if self.path in {"/", "/index.html"}:
            self._send(200, INDEX_HTML.encode("utf-8"), "text/html; charset=utf-8")
            return
        self._send_json(404, {"detail": "Not Found"})

    def do_POST(self) -> None:
        if self.path != "/run":
            self._send_json(404, {"detail": "Not Found"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            result = self.controller.run(
                payload["input"],
                session_id=payload.get("session_id"),
                compute_budget=payload.get("compute_budget", "medium"),
            )
        except Exception as exc:
            self._send_json(400, {"detail": str(exc)})
            return
        self._send_json(200, result.model_dump(mode="json"))

    def log_message(self, format: str, *args) -> None:
        print(f"{self.address_string()} - {format % args}")

    def _send_json(self, status: int, payload: dict) -> None:
        self._send(status, json.dumps(payload).encode("utf-8"), "application/json")

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the lightweight Cognitive Multiplexer demo server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), DemoHandler)
    print(f"Cognitive Multiplexer demo server running at http://{args.host}:{args.port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
