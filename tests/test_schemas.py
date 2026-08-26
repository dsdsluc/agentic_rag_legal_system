"""Guards the P0 input-size limits added to QueryRequest/ChatTurn (see
plans/plan.txt §1.1, §1.2) — /query is called directly from the browser
with no auth in front of it, so these bounds are the only thing stopping
an oversized request from ballooning LLM cost."""

import pytest
from pydantic import ValidationError

from api.schemas import ChatTurn, QueryRequest


def test_question_within_limit_accepted():
    QueryRequest(question="Mức phạt vượt đèn đỏ là bao nhiêu?")


def test_question_over_max_length_rejected():
    with pytest.raises(ValidationError):
        QueryRequest(question="x" * 2001)


def test_empty_question_rejected():
    with pytest.raises(ValidationError):
        QueryRequest(question="")


def test_history_within_limit_accepted():
    QueryRequest(question="hi", history=[ChatTurn(question="q", answer="a")] * 20)


def test_history_over_max_length_rejected():
    with pytest.raises(ValidationError):
        QueryRequest(question="hi", history=[ChatTurn(question="q", answer="a")] * 21)


def test_chat_turn_answer_over_max_length_rejected():
    with pytest.raises(ValidationError):
        ChatTurn(question="q", answer="x" * 4001)


def test_top_k_within_cap_accepted():
    QueryRequest(question="hi", top_k=10)


def test_top_k_over_cap_rejected():
    with pytest.raises(ValidationError):
        QueryRequest(question="hi", top_k=11)


def test_top_k_below_minimum_rejected():
    with pytest.raises(ValidationError):
        QueryRequest(question="hi", top_k=0)
