# Cognitive Multiplexer

## Revenue Leak Auditor

`revenue-auditor/` is a zero-cost, local-first audit tool for service businesses. It compares contract terms, invoices, payments, and time entries to surface unbilled work, underbilling, overdue balances, retainer gaps, missed price increases, approaching renewals, and scope creep.

### Run locally

The portfolio and auditor are static files. Serve the repository root so ES modules and IndexedDB use a normal web origin:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/revenue-auditor/`. Opening the HTML directly with `file://` is not supported.

### Test

The auditor core uses Node's built-in test runner and has no package installation step:

```bash
node --test revenue-auditor/tests/core.test.mjs
```

The existing Python project remains testable with:

```bash
pytest
```

### Deploy

The repository remains compatible with GitHub Pages' branch-based static publishing. Commit and push the files; no build command, paid hosting, server, account system, API key, or environment secret is required. Relative URLs make the auditor work at `/revenue-auditor/` under the existing Pages site.

### Architecture and privacy

- `core.js` contains CSV parsing, validation, contract-candidate extraction, deterministic detection rules, and summaries.
- `storage.js` owns versioned IndexedDB persistence. Audit records use `schemaVersion: 1`; future versions migrate through `migrateAudit`.
- `app.js` controls imports, explicit contract confirmation, reporting, filters, deletion, and local exports.
- Imported records, extracted contract text, and findings remain in the browser. There is no analytics or backend request.
- PDF.js is loaded as executable code from a pinned public CDN when—and only when—the user selects a PDF. The PDF bytes are passed to that library inside the browser and are never uploaded. All CSV processing and the full demo work without that optional download.
- Clearing browser/site data deletes saved audits. Users should export reports they need to retain.

### Supported imports

Templates are downloadable from the import screen:

- Invoices: client name, invoice number, invoice date, amount; optional due date, billed hours, billed rate, and status.
- Payments: client name, invoice number, payment date, and amount.
- Time entries: client name, date, and hours; optional billable/invoiced flags, invoice number, and description.
- Contracts: text-based PDFs. Detected client, rate, retainer, included hours, payment terms, annual increase, and dates must be reviewed and confirmed by a person.

CSV headers are mapped interactively, so source column names may differ. Dates accept `YYYY-MM-DD` or `MM/DD/YYYY`. Monetary values accept plain numbers, common currency symbols, commas, and accounting-style parentheses. Each audit has one confirmed reporting currency (USD, EUR, GBP, CAD, or AUD); currency conversion is intentionally not performed.

### Methodology and limitations

Findings are deterministic and expose their calculation, evidence, severity, confidence, and recommended next action. Missing confirmed values produce incomplete findings instead of invented dollar estimates. Duplicate imports are skipped using stable business keys.

The MVP does not perform OCR, currency conversion, tax analysis, contract interpretation, or accounting reconciliation beyond the disclosed rules. It cannot account for credits, discounts, side agreements, or verbal scope changes. Results are decision support, not accounting or legal advice, and should be checked against source systems.

Cognitive Multiplexer is a working Python prototype of a modular AI runtime.
It is inspired by the idea:

> Attention routes information across tokens. Cognition routes information across memory, experts, tools, verification, and time.

This is not a model training project. It is a clear, runnable skeleton for a future AI operating system: user input moves through explicit cognitive channels instead of being flattened into one large prompt.

## Architecture

A normal chatbot pipeline is roughly:

```text
Input -> context -> model -> output
```

Cognitive Multiplexer uses:

```text
Input
-> task/stakes classifier
-> working memory update
-> long-term memory retrieval
-> expert routing
-> candidate generation
-> verification
-> final answer
-> optional memory write
```

The package separates these channels:

- Goal channel: `perception.py`
- Memory channel: `working_memory.py` and `long_term_memory.py`
- Expert channel: `expert_router.py` and `experts.py`
- Reasoning/candidate channel: `candidate_generator.py`
- Verification channel: `verifier.py`
- Final response/trace channel: `controller.py`

## Install

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

The prototype runs without an API key by using `MockLLMClient`. `OpenAIClient` is included only as a placeholder boundary for a future provider implementation.

## CLI

```bash
python -m cognitive_multiplexer "How should I plan my week?"
python -m cognitive_multiplexer "Write a Python function to deduplicate a list of dictionaries by id." --trace
python -m cognitive_multiplexer "Help me decide whether to quit my job and start a company." --compute-budget high --trace
```

## FastAPI

```bash
uvicorn cognitive_multiplexer.api:app --reload
```

Then call:

```bash
curl -X POST http://127.0.0.1:8000/run \
  -H "Content-Type: application/json" \
  -d '{"input":"Help me decide whether to quit my job and start a company.","session_id":"demo","compute_budget":"medium"}'
```

Response shape:

```json
{
  "answer": "...",
  "trace": {
    "compute_budget": "medium",
    "perception": {
      "task_type": "planning",
      "estimated_stakes": "high"
    },
    "retrieved_memories": [],
    "routing_plan": "...",
    "candidate_summaries": [],
    "verification_scores": [],
    "final_selected_answer": "...",
    "memory_written": false
  }
}
```

## Example Behaviors

Input:

```text
Help me decide whether to quit my job and start a company.
```

Expected behavior:

- Classifies the request as planning and high stakes.
- Routes to Planning, General Reasoning, Safety, and Verification experts.
- Generates direct, cautious, and creative candidates.
- Selects a cautious answer with decision thresholds, validation steps, and warnings against overconfidence.

Input:

```text
Write a Python function to deduplicate a list of dictionaries by id.
```

Expected behavior:

- Classifies the request as coding.
- Routes to Coding and Verification experts.
- Produces runnable Python code.
- Verifies edge cases such as missing `id`, empty input, duplicates, and runtime complexity.

## How This Differs From A Normal Chatbot

A normal chatbot tends to mix goal interpretation, memory, reasoning, safety, and final wording inside one prompt. Cognitive Multiplexer makes those responsibilities explicit and inspectable. Every run returns a JSON trace showing what the system perceived, which memories it retrieved, which experts were selected, which candidates were generated, how verification scored them, and whether anything was written to long-term memory.

## Adaptive Compute

The optional `compute_budget` parameter controls how much work the controller does:

- `low`: one candidate plus verification.
- `medium`: one candidate for simple tasks, three candidates for complex or high-stakes tasks.
- `high`: three candidates even when the task looks simple, leaving room for deeper future cycles.

## Tests

```bash
pytest
```
