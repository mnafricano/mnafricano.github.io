# Cognitive Multiplexer

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
