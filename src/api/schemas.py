from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from rag.generate import AnswerMode, AnswerResult
from rag.query_rewrite import QueryIntent
from rag.retriever import RetrievedChunk
from rag.usage import UsageEvent


class ChatTurn(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    answer: str = Field(..., min_length=1, max_length=4000)


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    # Prior turns, oldest first — a short follow-up ("Xe máy") answering the
    # system's own clarifying question is meaningless run through retrieval
    # alone, so this lets answer_question() condense it against context
    # first. Empty by default: single-turn callers are unaffected.
    # Capped at 20 turns: this is client-supplied and unverified (not
    # re-fetched from a trusted store), so an unbounded list is both a
    # cost-abuse vector (each turn gets folded into the condense_question
    # prompt) and unnecessary — condense_question only needs recent context.
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)
    # Capped at 10 (not 20): top_k drives an LLM call per "article" chunk in
    # retrieve()'s trim step, run concurrently — this endpoint is called
    # directly from the browser with no auth in front of it, so top_k is a
    # direct multiplier on how many OpenAI calls one request can trigger.
    top_k: int = Field(default=5, ge=1, le=10)
    mode: AnswerMode = Field(default="citizen")
    # Manual override from the chat UI's domain selector — one of
    # domain_classify.ALL_DOMAINS, or omitted/None for "Auto" (the default),
    # which runs classify_domains() on the question instead.
    domain: Optional[Literal["giao_thong", "dan_su", "hinh_su"]] = Field(default=None)
    use_graph_expansion: bool = Field(default=False)
    # Off-by-default was "pending eval" — the eval suite (which always ran
    # with this on) now shows 9/9 cases passing at 5.00/5 faithfulness, and
    # a direct comparison on a real multi-violation article (ND_168 Điều 7,
    # 13 unrelated violations in one Điều) showed the untrimmed path citing
    # a wrong khoản's fine outright (10-14tr instead of the correct 4-6tr)
    # — not just "less precise", actively wrong. The frontend never passed
    # this field at all, so it silently ran the unvalidated path in
    # production the whole time this defaulted to False.
    trim_context: bool = Field(default=True)


class SourceOut(BaseModel):
    chunk_id: str
    doc_id: str
    doc_title: str
    doc_type: str
    article_number: Optional[int]
    article_heading: str
    chunk_type: str
    needs_review: bool
    is_amendment_context: bool
    amends_doc_id: Optional[str]
    graph_hop: Optional[int]
    graph_relation: Optional[str]
    trimmed_to_khoan: Optional[int]
    score: float

    @classmethod
    def from_chunk(cls, chunk: RetrievedChunk) -> "SourceOut":
        return cls(
            chunk_id=chunk.chunk_id,
            doc_id=chunk.doc_id,
            doc_title=chunk.doc_title,
            doc_type=chunk.doc_type,
            article_number=chunk.article_number,
            article_heading=chunk.article_heading,
            chunk_type=chunk.chunk_type,
            needs_review=chunk.needs_review,
            is_amendment_context=chunk.is_amendment_context,
            amends_doc_id=chunk.amends_doc_id,
            graph_hop=chunk.graph_hop,
            graph_relation=chunk.graph_relation,
            trimmed_to_khoan=chunk.trimmed_to_khoan,
            score=chunk.score,
        )


class IntentOut(BaseModel):
    violation: Optional[str]
    vehicle_type: Optional[str]
    info_need: Optional[str]
    vehicle_type_ambiguous: bool

    @classmethod
    def from_intent(cls, intent: QueryIntent) -> "IntentOut":
        return cls(
            violation=intent.violation,
            vehicle_type=intent.vehicle_type,
            info_need=intent.info_need,
            vehicle_type_ambiguous=intent.vehicle_type_ambiguous,
        )


class UsageEventOut(BaseModel):
    stage: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_usd: float

    @classmethod
    def from_event(cls, e: UsageEvent) -> "UsageEventOut":
        return cls(
            stage=e.stage,
            model=e.model,
            prompt_tokens=e.prompt_tokens,
            completion_tokens=e.completion_tokens,
            total_tokens=e.total_tokens,
            cost_usd=e.cost_usd,
        )


class UsageOut(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_usd: float
    # Per-LLM-call detail (query_rewrite, condense_question, khoan_select,
    # relevance_filter, generate/generate_agent, reflection) — lets the admin
    # dashboard show where within one request the cost actually went, not
    # just the total.
    breakdown: list[UsageEventOut]

    @classmethod
    def from_events(cls, events: list[UsageEvent]) -> "UsageOut":
        return cls(
            prompt_tokens=sum(e.prompt_tokens for e in events),
            completion_tokens=sum(e.completion_tokens for e in events),
            total_tokens=sum(e.total_tokens for e in events),
            cost_usd=sum(e.cost_usd for e in events),
            breakdown=[UsageEventOut.from_event(e) for e in events],
        )


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceOut]
    mode: AnswerMode
    intent: Optional[IntentOut] = None
    condensed_question: Optional[str] = None
    usage: UsageOut
    # Resolved subject-matter domain(s) — the manual override as a 1-item
    # list, or classify_domains()'s auto-detected list. The "verification"
    # step the UI's domain selector promises: shown back to the user as what
    # the system understood the question to be about. All 3 present means no
    # filter was actually applied (ambiguous or genuinely cross-domain).
    domains: list[str] = Field(default_factory=list)

    @classmethod
    def from_result(cls, result: AnswerResult) -> "QueryResponse":
        return cls(
            answer=result.answer,
            sources=[SourceOut.from_chunk(c) for c in result.sources],
            mode=result.mode,
            intent=IntentOut.from_intent(result.intent) if result.intent else None,
            condensed_question=result.condensed_question,
            usage=UsageOut.from_events(result.usage_events),
            domains=result.domains,
        )


class HealthResponse(BaseModel):
    status: str
