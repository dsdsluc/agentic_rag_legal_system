"""The input scope gate in answer_question (layer 2 of input security —
investigation/security/inspectation.txt): an off-topic or attack message
must be answered with a fixed polite refusal WITHOUT running retrieval or
generation; a legal one must go through unchanged. The
classifier itself (an LLM call) is stubbed — no OpenAI calls here."""

import pytest

import rag.generation.generate as generate
from rag.input.domain_classify import (ALL_DOMAINS, SCOPE_ATTACK, SCOPE_LEGAL, SCOPE_OFF_TOPIC,
                                 QuestionClass)


@pytest.fixture
def pipeline_spy(monkeypatch):
    calls = {"retrieve": 0}

    def fake_retrieve(*args, **kwargs):
        calls["retrieve"] += 1
        calls["domains"] = kwargs.get("domains")
        return []  # -> answer_question's "không tìm thấy" early return, no generation call

    monkeypatch.setattr(generate, "retrieve", fake_retrieve)
    return calls


@pytest.mark.parametrize("scope", [SCOPE_OFF_TOPIC, SCOPE_ATTACK])
def test_declined_scope_short_circuits(monkeypatch, pipeline_spy, scope):
    monkeypatch.setattr(generate, "classify_question", lambda q: QuestionClass(scope, ()))
    result = generate.answer_question("anything")
    assert result.scope == scope
    assert result.answer == generate.OUT_OF_SCOPE_ANSWERS[scope]
    assert result.sources == [] and result.domains == []
    assert pipeline_spy["retrieve"] == 0


def test_legal_question_goes_through(monkeypatch, pipeline_spy):
    monkeypatch.setattr(generate, "classify_question",
                        lambda q: QuestionClass(SCOPE_LEGAL, ("hinh_su",)))
    result = generate.answer_question("Trộm cắp tài sản bị phạt tù bao nhiêu năm?")
    assert result.scope == SCOPE_LEGAL
    assert pipeline_spy["retrieve"] == 1
    assert pipeline_spy["domains"] == ["hinh_su"]


def test_manual_domain_still_gated_but_keeps_user_choice(monkeypatch, pipeline_spy):
    monkeypatch.setattr(generate, "classify_question",
                        lambda q: QuestionClass(SCOPE_LEGAL, ALL_DOMAINS))
    generate.answer_question("Mức phạt vượt đèn đỏ?", domain="giao_thong")
    assert pipeline_spy["domains"] == ["giao_thong"]

    monkeypatch.setattr(generate, "classify_question", lambda q: QuestionClass(SCOPE_OFF_TOPIC, ()))
    result = generate.answer_question("Công thức nấu phở?", domain="giao_thong")
    assert result.scope == SCOPE_OFF_TOPIC
    assert pipeline_spy["retrieve"] == 1  # the off-topic call did not retrieve
