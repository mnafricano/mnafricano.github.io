# Cognitive Multiplexer

## Erome Public-Feed Archiver

The repository also contains a local-only Python service that watches Erome's public
`/explore/new` feed, baselines existing albums, and archives media from albums that
appear afterward. It uses a restart-safe SQLite queue, pauses below 10 GB of free
disk space, and exposes a dashboard only on `127.0.0.1:8765`.

Only download content you are legally entitled to keep. The service does not sign
in, access private albums, bypass access controls, or redistribute files.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
erome-archiver serve
```

Open `http://127.0.0.1:8765`. On macOS, enable automatic startup at login with:

```bash
erome-archiver install
```

Stop and remove the login service with `erome-archiver uninstall`. State and logs
live in `~/Library/Application Support/Erome Archiver`; downloaded albums default
to `~/Downloads/Erome Archive`.

Each album folder contains `album.json` and `media-metadata.json`. The metadata
sidecar records source URLs, selected response headers, file sizes, SHA-256 hashes,
image dimensions and EXIF, plus available video container fields such as duration,
dimensions, frame rate, bitrate, dates, and tags. Existing completed albums are
enriched automatically in the background after upgrading. Albums containing GPS
or other location metadata are renamed with a leading `📍 `.

Open `http://127.0.0.1:8765/library` or choose **Saved Library** from the dashboard
to search completed albums and expand them into local picture/video galleries.
Choose **Shuffle Feed** for a full-screen, snap-scrolling random mix of locally
saved pictures and videos. Videos play muted while centered. Every feed item has
an album-level delete action that first displays the complete album and requires
a second explicit confirmation before permanently removing its folder.
Files larger than 500 MB are stopped before their bodies are downloaded and shown
in the dashboard with an available poster/thumbnail, exact size, and **Download
file** or **Skip file** controls. The decision is stored in SQLite and survives
restarts. If a server omits the file size, the transfer stops at the 500 MB boundary
and waits for the same approval.

Multiple albums can download simultaneously (three by default, configurable from
1–10). Together they share a global pool of up to 10 parallel media-file transfers,
also configurable from 1–10. Every active album has its own progress bar and
**Cancel download** action. Confirming it stops only that album's in-flight
transfers, removes its completed and partial files, and leaves the album marked
canceled so it is not automatically queued again.

### Double-clickable M4 Mac app

On an Apple Silicon Mac, build a standalone application bundle with:

```bash
./scripts/build-erome-archiver-macos.sh
```

The finished `dist/Erome Archiver.app` can be moved to `/Applications` and opened
like any other Mac app. It contains Python and all runtime dependencies; the source
repository and virtual environment are not required after the app is built.

## Revenue Leak Auditor

Revenue Leak Auditor is a multi-tenant SaaS for service businesses. It compares contracts, invoices, payments, and time entries to surface explainable unbilled work, underbilling, overdue balances, retainer gaps, missed increases, renewal risk, and scope creep.

The production frontend lives in `apps/revenue-auditor/`, Supabase migrations and Edge Functions live in `supabase/`, and Vite emits the checked deployment artifact to `revenue-auditor/` for the existing GitHub Pages URL.

### Run locally

Prerequisites: Node 22, pnpm, Docker, and the Supabase CLI.

```bash
pnpm install
cp apps/revenue-auditor/.env.example apps/revenue-auditor/.env.local
cp supabase/.env.example supabase/.env
supabase start
supabase db reset
pnpm auditor:dev
```

Open `http://localhost:5173/revenue-auditor/`. Without Supabase environment values the frontend intentionally enters launch-preview mode: the full Team demo works, while account and provider mutations remain disabled.

### Test

```bash
pnpm auditor:check
supabase test db
deno test --allow-env supabase/functions/tests
pnpm --dir apps/revenue-auditor test:e2e
```

The existing Python project is still tested independently:

```bash
pytest
```

### Architecture

- React, TypeScript, and Vite provide separate static entrypoints for marketing, authentication, workspace, account, admin, and legal surfaces.
- Supabase Auth provides password, Google OAuth, PKCE sessions, password recovery, and TOTP MFA.
- Postgres stores workspace-scoped normalized records. Row-level policies are applied to every customer table; entitlements are also enforced with database triggers.
- Private Supabase Storage holds contracts under `workspace/audit/object` paths with membership and quota policies.
- The shared deterministic engine runs in a Supabase Edge Function and creates immutable versioned `audit_runs` plus findings.
- Stripe Billing Checkout/Portal is isolated from customer-authorized Stripe Connect OAuth.
- QuickBooks and Stripe imports normalize provider records, use encrypted server-only refresh tokens, support incremental sync, and expose retryable error states without deleting prior data.
- IndexedDB v1 audits are detected after sign-in and copied only after explicit confirmation.

### Plans and operational limits

- Free: one personal seat, three clients, one active audit, 50 MB, manual imports.
- Solo: $39/month or $390/year, 25 clients/audits, 1 GB, connected data and weekly audits.
- Team: $129/month or $1,290/year, five seats, 100 clients/audits, 5 GB, invitations and roles.

Provider fees are incurred only after revenue. Before accepting the first paid production customer, upgrade Supabase to Pro for backups and non-pausing production infrastructure.

### Deployment

`pnpm auditor:build` emits the static application into `revenue-auditor/`. The Pages workflow assembles the portfolio and deploys it with `actions/deploy-pages`.

Configure these GitHub Pages variables: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPPORT_EMAIL`, `AUTH_FROM_EMAIL`, and optionally `TURNSTILE_SITE_KEY`. Add all server secrets from `supabase/.env.example` with `supabase secrets set --env-file supabase/.env`.

GitHub repository settings must use **GitHub Actions** as the Pages source. Supabase redirect URLs must include the production and localhost paths in `supabase/config.toml`.

### External launch gates

Implementation is complete without embedding credentials. Public launch still requires operator-owned external state:

1. Create the production Supabase project and apply migrations/functions.
2. Configure the verified SendGrid sender/support address, then set `VITE_EMAIL_AUTH_ENABLED=true`.
3. Create Stripe products/prices, webhook, Connect application, and live account.
4. Create Intuit sandbox/production applications and complete production review.
5. Review legal copy and set the initial platform administrator in `profiles`.
6. Enable GitHub Actions Pages deployment and run the launch smoke test.

Do not upload HIPAA-regulated data, payment-card numbers, or data requiring a specialized compliance agreement. Findings remain decision support, not accounting, collections, tax, or legal advice.

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
