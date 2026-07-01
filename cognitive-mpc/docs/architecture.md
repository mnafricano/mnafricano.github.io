# Cognitive MPC architecture

## Purpose and boundary

Cognitive MPC is a small cognitive operating system for experiments in
stateful, model-based agents. Its useful claim is architectural: planning,
simulation, verification, state, memory, scheduling, tools, and audit logs can
be separated into modules with explicit contracts.

The prototype does not claim general intelligence, privileged access to hidden
reasoning, or accurate prediction of the world. The “world model” is a visible
heuristic estimator. Its value is that it gives the controller several futures
to compare and gives a researcher concrete seams to replace.

## One cycle

1. **Observe.** Associate user evidence with the one action currently awaiting
   a result. Classify the outcome and estimated surprise.
2. **Update state.** Close the prior task, append the observation, and adjust
   uncertainty.
3. **Schedule.** Always queue planning and verification. Queue reflection after
   observations; the workbench runs consolidation and replay as idle,
   non-overlapping maintenance.
4. **Retrieve.** Search semantic and procedural memory for goal-relevant
   context.
5. **Generate.** Produce at least three candidate plan horizons with steps,
   assumptions, risks, resources, effort, and feedback signals.
6. **Simulate.** Estimate benefit, cost, uncertainty, risk, reversibility,
   resource demand, and compounding value.
7. **Verify.** Check plan structure, vague or impossible actions, missing
   feedback, unavailable resources, disabled tools, unsafe phrases, and simple
   contradictions.
8. **Score.** Apply the configurable utility equation, verification penalty,
   and action-history penalty.
9. **Commit once.** Select one next step from the best feasible trajectory.
   Store it as a task awaiting observation. Do not execute the rest of the
   plan.
10. **Remember and audit.** Write the decision to episodic memory, run due
    maintenance processes, persist JSON state/memory, and append a complete
    JSONL cycle record.

The foreground sequence is deliberately synchronous so causal order is easy to
inspect. Maintenance uses a low-priority background coordinator that can
acquire the same cycle lock only after the configured idle interval.

## Conversational interface

`CognitiveChatRuntime` adapts the control loop to messages without collapsing
the architecture into a chatbot prompt:

- an intent router classifies goal, observation, question, and command inputs;
- confidence below 0.7 requests an explicit mode selection;
- questions preserve the pending task instead of falsely completing it;
- commands enter the tool/approval pipeline;
- the assistant response summarizes the selected trajectory and next action;
- the complete candidate, simulation, verifier, scheduler, and memory record is
  attached as structured decision-trace data;
- chat history is persisted separately from episodic, semantic, and procedural
  memory;
- a new chat creates a new conversation but does not erase world state or
  learned memory.

An optional `LanguageModel` boundary generates the user-facing response after
the deterministic controller commits to an action. The included local Ollama
adapter receives the verified decision context and recent conversation, and is
instructed to create cognitive artifacts rather than merely repeat “create
this.” It cannot change the selected plan or bypass verification. Provider,
model, response mode, and generation metadata are attached to the message.

If no model is available—or generation fails—the adapter returns an explicitly
labeled template response. The UI also exposes model status globally. This
prevents a deterministic template from masquerading as AI-generated language.

The browser client talks to a same-origin JSON/SSE API served only on localhost
by default. It requires no JavaScript build process and no third-party runtime
dependencies. Stream events identify intent, planning, simulation,
verification, selection, tokens, approval requests, completion, and errors.

## Imported ideas

### Model-predictive control

Classical MPC repeatedly optimizes over a finite future horizon, applies the
first control input, measures the resulting system state, and solves again.
Here, candidate plans are the horizon and a `PlanStep` is the control input.
User observations are measurements.

Receding-horizon commitment has two practical benefits:

- later actions can change when an assumption fails;
- the runtime does not confuse a plausible plan with completed work.

The runtime explicitly refuses to advance a goal that has a pending action and
no observation.

### Neuroscience-inspired memory

The memory taxonomy is functional rather than biologically literal:

- episodic records preserve what happened and when;
- semantic records compress recurring evidence into reusable propositions;
- procedural records retain strategies that repeatedly correlate with
  success;
- replay reviews recent experiences for surprises, failures, successes,
  recurring patterns, and strategy changes;
- consolidation preserves source episode IDs so compressed knowledge remains
  auditable.

Consolidation is intentionally conservative. Three matching episodes are
required by default. A semantic memory can form from recurrence; a procedural
memory additionally requires repeated successful outcomes and an explicit
procedure candidate.

### Operating systems

The runtime borrows OS concepts without pretending to be a kernel:

- the cognitive scheduler assigns processes a priority and a reason;
- state and memory are separate managed stores;
- tasks have lifecycle states;
- tools are capabilities checked against a permission table;
- JSONL logs form an audit trail;
- module interfaces isolate planning, simulation, verification, and execution
  concerns.

Planning and verification are high-priority foreground processes.
Consolidation, replay, and rotating backups are lower-priority maintenance work
that cannot overlap a chat cycle.

### Cybersecurity

The tool bus follows least privilege:

- shell permission is off by default;
- write permission is separate from read permission;
- file paths are resolved and confined to the configured workspace;
- the command runner uses an argument vector and does not invoke a shell
  parser;
- note writes and every enabled shell call require an exact, single-use
  approval that expires after ten minutes;
- the model can propose at most four calls per user turn;
- every allowed, denied, successful, and failed call becomes an audit event;
- verification fails plans that require the disabled shell tool.

These are prototype guardrails, not strong process isolation. A production
runtime should use operating-system sandboxes, per-tool allowlists, resource
limits, secret filtering, human approval for consequential actions, and
tamper-resistant logs.

## State model

`WorldState` contains:

- user goals and lifecycle status;
- arbitrary environment facts;
- active and completed one-step tasks;
- per-goal uncertainty in the interval `[0, 1]`;
- a bounded recent-observation window;
- long-term beliefs with confidence and evidence counts;
- a monotonic cycle counter.

Writes use a temporary file followed by an atomic replace. This protects
against partial files, but it does not provide multi-process transactions.

## Planning contract

`PlannerBackend.generate()` receives goal text, the current `WorldState`, and
retrieved memory strings. It returns `CandidatePlan` objects.
`OllamaPlannerBackend` asks `qwen3:8b` for 3–5 schema-constrained, structurally
different candidates at temperature 0.1. The included `HeuristicPlanner`
selects learning, building, or general strategy families when Ollama is
offline, times out, or returns invalid data. That fallback is attached to the
trace and audit log.

The three plans intentionally differ in trajectory, not wording. For a
learning goal, for example, they compare foundation-first, diagnostic
practice-first, and project-first approaches.

An LLM implementation should be an adapter to this contract. It must not bypass
verification or produce tool side effects while proposing plans.

## Simulation and scoring

The initial world model uses structural features:

- presence of feedback and practical experiments raises likely benefit;
- foundation and feedback-loop structure raise compounding value;
- estimated effort and resource count raise cost;
- assumptions and current world-state uncertainty raise uncertainty;
- declared risks and irreversible steps raise risk;
- the fraction of reversible steps determines reversibility.

Default utility:

```text
U(plan) = benefit + compounding_value + reversibility
          - cost - risk - uncertainty
```

All terms use a zero-to-ten scale. `ScoringWeights` can change their relative
importance. The controller then subtracts:

```text
adjusted = U(plan) - verifier_penalty - history_penalty
```

A verifier error costs much more than a warning. A failed step invalidates that
plan for the current horizon so the controller compares alternatives instead
of skipping over a failed prerequisite.

## Scheduler policy

Foreground scheduler policy:

| Process | Trigger | Priority |
| --- | --- | ---: |
| Planning | every cycle | 100 |
| Verification | every cycle | 90 |
| Reflection | new observation | 60–85 |
| Consolidation | legacy CLI cycle trigger / idle workbench trigger | 45 |
| Replay | legacy CLI cycle trigger / idle workbench trigger | 40 |

In the workbench, `MaintenanceManager` runs overdue replay and consolidation
after ten idle minutes, no more than once per 24 hours. It uses the chat-cycle
lock, catches up after launch, and creates a daily rotating backup. The
scheduler still returns explicit decisions for CLI research and future
experiments with budgets, queues, deadlines, and starvation prevention.

## Persistence and recovery

The web app stores state beneath macOS Application Support and audit logs
beneath `~/Library/Logs`. `DataMigrator` performs a copy-only first-run upgrade:
it archives legacy source files, copies them, validates JSON/schema shape and
record counts, then writes a migration marker. Failure removes partial
destinations and leaves the source untouched.

Settings, approvals, maintenance state, world state, chat history, and all
three memory stores use versioned JSON. Writes use a temporary file followed by
an atomic replace. `BackupManager` validates every JSON member before restore
and creates a pre-restore safety snapshot.

## Model trust boundary

The local model has two narrow roles:

1. propose schema-valid candidate horizons;
2. generate a user-facing answer or cognitive artifact grounded in the
   deterministic selected action.

Intent routing uses temperature 0 and structured output, planning uses 0.1,
and response generation uses 0.4. Hidden thinking is disabled in the Ollama
request. The model cannot approve tools, modify a score, skip verification, or
replace the selected plan.

## Audit record

Every `control_cycle` JSONL event contains:

- goal and observation;
- a full state snapshot;
- scheduler decisions;
- serialized candidate plans;
- complete simulations and score components;
- verifier checks, warnings, errors, and penalties;
- adjusted scores;
- selected next action and explanation;
- observation, decision, replay, and consolidation memory IDs.

The event is sufficient to reconstruct why the heuristic controller selected
an action. It does not store private model chain-of-thought because the MVP has
no generative model and because the architecture relies on explicit decision
artifacts instead.

## Extension seams

- Replace `PlannerBackend` with a schema-validated LLM or search planner.
- Replace `HeuristicWorldModel` with a task-specific simulator or calibrated
  learned model.
- Add embeddings behind `MemoryStore.search` while retaining lexical fallback.
- Represent beliefs and causal links in a graph store.
- Discover `Tool` implementations through a plugin registry.
- Run pairwise plan tournaments before scalar scoring.
- Track predicted versus observed score components for uncertainty
  calibration.
- Move replay to a scheduled local daemon.
- Present cycle records in a web UI without changing controller semantics.
