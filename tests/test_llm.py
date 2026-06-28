import pytest

from cognitive_multiplexer.llm import OpenAIClient, default_llm_client


def test_default_llm_client_uses_mock_without_env(monkeypatch):
    monkeypatch.delenv("COGNITIVE_MULTIPLEXER_LLM", raising=False)

    assert default_llm_client().__class__.__name__ == "MockLLMClient"


def test_openai_client_requires_api_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with pytest.raises(RuntimeError):
        OpenAIClient()
