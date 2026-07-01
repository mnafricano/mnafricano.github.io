# Cognitive MPC

Cognitive MPC is a private, local AI workbench built around receding-horizon
control. A local Qwen model proposes plans and writes useful responses, while
deterministic Python code remains authoritative for simulation, verification,
scoring, permissions, and selection of the next action.

It is a research prototype—not an AGI claim, unrestricted autonomous agent, or
hosted service. No account, API key, telemetry, or cloud provider is required.

## Quick start on macOS

The supported default model is `qwen3:8b` through Ollama.

```bash
cd cognitive-mpc
./scripts/setup_macos.sh
open "dist/Cognitive MPC.app"
```

The setup script installs Ollama with Homebrew if necessary, downloads the
5.2 GB model, and builds an unsigned personal app. macOS may require
Control-click → Open the first time because the bundle is not code-signed.

To rebuild the app without reinstalling the model:

```bash
python3 scripts/build_macos_app.py
```

Diagnostic launch paths remain available:

```bash
python3 main.py --web       # browser workbench on 127.0.0.1:8787
python3 main.py             # deterministic terminal interface
```

The web app stores mutable data under:

```text
~/Library/Application Support/Cognitive MPC/
~/Library/Logs/Cognitive MPC/
```

On the first upgraded web launch, repository-local state, memory, history, and
logs are copied after a timestamped backup. Source files are never deleted.
The terminal interface continues using repository-local `data/` paths for
diagnostics.

## The control loop

```text
Goal → World state → Candidate plans → Simulation → Verification
     → Scoring → One next action → Observation → Memory → Replay → Replan
```

Qwen receives a bounded state and memory snapshot and proposes 3–5 structured
plan horizons. Invalid JSON, a timeout, or an offline model causes a visible
fallback to `HeuristicPlanner`. The model never chooses the winner.

The deterministic score is:

```text
score = benefit + compounding_value + reversibility
        - cost - risk - uncertainty
```

Verifier and failed-action history penalties are then subtracted. Every term,
warning, alternative, and selected action appears in the decision trace and
JSONL audit log. The controller commits to only the next step and requires an
observation before advancing that goal.

## Workbench behavior

Messages are routed into four modes:

- **Goal** runs the complete MPC loop.
- **Result** resolves the pending action and replans.
- **Question** receives a grounded answer without falsely completing anything.
- **Command** enters the tool and approval pipeline.

Auto routing uses confidence; ambiguous messages ask for a mode selection.
Composer chips always allow an explicit override. Responses and phase events
stream through `/api/chat/stream`. If the selected action requests a schedule,
checklist, outline, analysis, or exercise, the model creates the artifact
immediately while remaining grounded in the selected action.

If Ollama is unavailable, the app says **TEMPLATE FALLBACK**. It never presents
a predetermined response as generated AI.

## Tools and approvals

Choose a workspace in Settings before using file tools. Resolved paths must
remain inside that folder.

- Calculator: automatic, bounded arithmetic.
- File reader: automatic, workspace-confined, bounded output.
- Note writer: exact arguments shown; one-time approval required.
- Shell runner: globally disabled by default. If enabled, every exact
  argument-vector command still requires one-time approval.

Approvals are persisted, expire after 10 minutes, and are single-use. Denied,
expired, altered, path-escaping, or repeated calls do not execute. The model
can propose at most four tool calls per turn. All outcomes are audited.

## Memory, replay, and recovery

The memory manager exposes:

- episodic events and observations;
- semantic reusable facts;
- procedural strategies and crystallized skills;
- lexical search, type filters, provenance, pinning, export, and confirmed
  per-item deletion.

Records are retained until manually deleted. After 10 idle minutes, overdue
replay and consolidation can run at most once per 24 hours and never overlap a
chat cycle. A missed run is caught up after the next launch. Automatic daily
backups retain seven snapshots; manual backup and confirmation-gated restore
are available in the workbench.

## Local API

The localhost server includes:

```text
GET  /api/status                 GET/PATCH /api/settings
POST /api/chat                   POST /api/chat/stream
GET  /api/memories              PATCH/DELETE /api/memories/{id}
GET  /api/approvals             POST /api/approvals/{id}/approve|deny
GET/POST /api/backups           POST /api/backups/{id}/restore
GET  /api/backups/export        POST /api/maintenance/run
GET  /api/health
```

The server binds to `127.0.0.1`; it is not designed for network exposure.

## Project structure

```text
cognitive-mpc/
├── main.py
├── web_server.py
├── core/
│   ├── approvals.py     # persisted exact-call approvals
│   ├── backups.py       # validated rotating snapshots
│   ├── chat.py          # intent-aware conversational runtime
│   ├── config.py        # settings, paths, migration
│   ├── controller.py    # receding-horizon control
│   ├── intent.py        # goal/result/question/command routing
│   ├── llm.py           # Ollama structured, tool, and stream adapter
│   ├── maintenance.py   # idle replay/consolidation/backups
│   ├── memory.py        # episodic/semantic/procedural memory
│   ├── planner.py       # Qwen and deterministic planner backends
│   ├── replay.py
│   ├── scheduler.py
│   ├── state.py
│   ├── tools.py
│   ├── verifier.py
│   └── world_model.py
├── web/                 # dependency-free responsive workbench
├── packaging/           # macOS bundle launcher and plist
├── scripts/
├── tests/
├── docs/architecture.md
└── examples/
```

## Tests

```bash
python3 -m unittest discover -s tests -v
python3 -m compileall -q .
```

Tests use temporary directories and fake Ollama servers; they do not need model
weights. Live acceptance requires a running `qwen3:8b`.

## Limitations

- Heuristic scores are design preferences, not calibrated probabilities.
- Lexical memory search misses semantic paraphrases.
- Rule verification is a guardrail, not a formal safety proof or OS sandbox.
- Local JSON stores support one application instance, not distributed writers.
- The unsigned app depends on a system Python 3 and separately installed
  Ollama/model weights.
- Streaming phase events are inspectable product events; private model
  chain-of-thought is disabled and never exposed.
- This v1 intentionally excludes cloud providers, accounts, unrestricted
  autonomy, vector/graph memory, plan tournaments, and an always-running
  daemon.

See [docs/architecture.md](docs/architecture.md) for the design and trust
boundaries.
