"""FastAPI surface for the Cognitive Multiplexer."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from cognitive_multiplexer.controller import CognitiveController
from cognitive_multiplexer.models import ComputeBudget


class RunRequest(BaseModel):
    input: str
    session_id: str | None = None
    compute_budget: ComputeBudget = "medium"


app = FastAPI(title="Cognitive Multiplexer", version="0.1.0")
controller = CognitiveController()


@app.get("/", response_class=HTMLResponse, response_model=None)
def index():
    return HTMLResponse("""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cognitive Multiplexer</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1115;
      --panel: #181b22;
      --panel-2: #20242d;
      --text: #f4f0e8;
      --muted: #a7adba;
      --line: #333947;
      --accent: #69d2c5;
      --accent-2: #f2c14e;
      --danger: #ff7a90;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 40px;
    }
    header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 22px;
    }
    h1 {
      margin: 0;
      font-size: clamp(2rem, 4vw, 4.25rem);
      line-height: .95;
      letter-spacing: 0;
    }
    .tagline {
      max-width: 560px;
      margin: 12px 0 0;
      color: var(--muted);
      font-size: 1rem;
      line-height: 1.5;
    }
    .status {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      padding: 10px 12px;
      color: var(--muted);
      white-space: nowrap;
    }
    .status strong { color: var(--accent); }
    .shell {
      display: grid;
      grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    section {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      padding: 16px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 1rem;
      letter-spacing: 0;
    }
    label {
      display: block;
      margin-bottom: 8px;
      color: var(--muted);
      font-size: .9rem;
    }
    textarea, input, select, button {
      width: 100%;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: #10131a;
      color: var(--text);
      font: inherit;
    }
    textarea {
      min-height: 168px;
      resize: vertical;
      padding: 12px;
      line-height: 1.45;
    }
    input, select { padding: 10px 12px; }
    .row {
      display: grid;
      grid-template-columns: 1fr 150px;
      gap: 10px;
      margin-top: 12px;
    }
    button {
      margin-top: 12px;
      padding: 12px 14px;
      cursor: pointer;
      border-color: transparent;
      background: var(--accent);
      color: #06110f;
      font-weight: 750;
    }
    button:disabled {
      cursor: wait;
      opacity: .65;
    }
    .examples {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }
    .examples button {
      margin: 0;
      text-align: left;
      background: var(--panel-2);
      color: var(--text);
      border-color: var(--line);
      font-weight: 600;
    }
    .answer {
      white-space: pre-wrap;
      line-height: 1.55;
      min-height: 130px;
      color: var(--text);
    }
    .channels {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 14px;
    }
    .channel {
      background: var(--panel-2);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      min-height: 82px;
    }
    .channel b {
      display: block;
      color: var(--accent-2);
      margin-bottom: 6px;
      font-size: .85rem;
    }
    .channel span {
      color: var(--muted);
      font-size: .92rem;
      line-height: 1.35;
    }
    details {
      margin-top: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #10131a;
    }
    summary {
      cursor: pointer;
      padding: 12px;
      color: var(--accent);
      font-weight: 700;
    }
    pre {
      margin: 0;
      padding: 0 12px 12px;
      overflow: auto;
      max-height: 460px;
      color: #d6dae3;
      font-size: .86rem;
      line-height: 1.45;
    }
    .error { color: var(--danger); }
    @media (max-width: 860px) {
      header, .shell { display: block; }
      .status { margin-top: 14px; display: inline-block; white-space: normal; }
      .channels { grid-template-columns: 1fr; }
      .row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Cognitive Multiplexer</h1>
        <p class="tagline">A modular AI runtime that routes work through perception, memory, experts, candidate generation, verification, and final response.</p>
      </div>
      <div class="status">API <strong>online</strong> · POST <code>/run</code></div>
    </header>

    <div class="shell">
      <section>
        <h2>Run A Cognitive Cycle</h2>
        <label for="input">Input</label>
        <textarea id="input">Help me decide whether to quit my job and start a company.</textarea>
        <div class="row">
          <div>
            <label for="session">Session</label>
            <input id="session" value="demo" />
          </div>
          <div>
            <label for="budget">Compute</label>
            <select id="budget">
              <option value="low">low</option>
              <option value="medium" selected>medium</option>
              <option value="high">high</option>
            </select>
          </div>
        </div>
        <button id="run">Run Multiplexer</button>
        <div class="examples">
          <button type="button" data-example="Help me decide whether to quit my job and start a company.">High-stakes planning example</button>
          <button type="button" data-example="Write a Python function to deduplicate a list of dictionaries by id.">Coding example</button>
          <button type="button" data-example="Remember that I prefer weekly plans with three priorities.">Memory write example</button>
        </div>
      </section>

      <section>
        <h2>Final Answer</h2>
        <div id="answer" class="answer">Run a cycle to see the final response here.</div>
        <div class="channels">
          <div class="channel"><b>Goal</b><span id="goal">Waiting for perception.</span></div>
          <div class="channel"><b>Memory</b><span id="memory">No retrieval yet.</span></div>
          <div class="channel"><b>Experts</b><span id="experts">No routing yet.</span></div>
          <div class="channel"><b>Candidates</b><span id="candidates">No candidates yet.</span></div>
          <div class="channel"><b>Verification</b><span id="verification">No scores yet.</span></div>
          <div class="channel"><b>Memory Write</b><span id="write">No write yet.</span></div>
        </div>
        <details>
          <summary>JSON Trace</summary>
          <pre id="trace">{}</pre>
        </details>
      </section>
    </div>
  </main>

  <script>
    const $ = (id) => document.getElementById(id);
    const runButton = $("run");

    document.querySelectorAll("[data-example]").forEach((button) => {
      button.addEventListener("click", () => {
        $("input").value = button.dataset.example;
      });
    });

    async function runCycle() {
      runButton.disabled = true;
      runButton.textContent = "Running...";
      $("answer").textContent = "Routing cognition...";
      $("answer").className = "answer";
      try {
        const response = await fetch("/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: $("input").value,
            session_id: $("session").value || null,
            compute_budget: $("budget").value
          })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const trace = payload.trace;
        $("answer").textContent = payload.answer;
        $("goal").textContent = `${trace.perception.task_type} · ${trace.perception.estimated_stakes} stakes`;
        $("memory").textContent = `${trace.retrieved_memories.length} retrieved`;
        $("experts").textContent = trace.routing_plan.selected_experts.map((expert) => expert.name.replace("Expert", "")).join(", ");
        $("candidates").textContent = `${trace.candidate_summaries.length} generated · ${trace.compute_budget} compute`;
        $("verification").textContent = trace.verification_scores.map((item) => item.score).join(", ");
        $("write").textContent = trace.memory_written ? "written" : "not written";
        $("trace").textContent = JSON.stringify(trace, null, 2);
      } catch (error) {
        $("answer").textContent = `Request failed: ${error.message}`;
        $("answer").className = "answer error";
      } finally {
        runButton.disabled = false;
        runButton.textContent = "Run Multiplexer";
      }
    }

    runButton.addEventListener("click", runCycle);
  </script>
</body>
</html>
""")


@app.post("/run")
def run(request: RunRequest):
    result = controller.run(
        request.input,
        session_id=request.session_id,
        compute_budget=request.compute_budget,
    )
    return result.model_dump(mode="json")
