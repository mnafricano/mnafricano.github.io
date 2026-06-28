from fastapi.testclient import TestClient

from cognitive_multiplexer.api import app


def test_api_run_endpoint_returns_answer_and_trace():
    client = TestClient(app)

    response = client.post(
        "/run",
        json={
            "input": "Write a Python function to deduplicate a list of dictionaries by id.",
            "session_id": "api-test",
            "compute_budget": "low",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert "answer" in payload
    assert "trace" in payload
    assert payload["trace"]["perception"]["task_type"] == "coding"
    assert payload["trace"]["compute_budget"] == "low"


def test_api_root_returns_ui():
    client = TestClient(app)

    response = client.get("/")

    assert response.status_code == 200
    assert "Cognitive Multiplexer" in response.text
    assert "Run Multiplexer" in response.text
