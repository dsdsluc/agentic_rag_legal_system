from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langsmith import traceable

from ingestion.models import ArticleChunk, KhoanRelation

from rag.generation import usage

load_dotenv()

RELATIONS_PATH = Path("data/processed/khoan_relations.json")
CORPUS_PATH = Path("data/processed/corpus.jsonl")
RELEVANCE_MODEL = "gpt-4o-mini"

# Phase C: gate injection on relevance to THIS query, not just on a
# supersession edge existing. A retrieved article can be a weak/borderline
# match overall and still surface (it's in the top-k), and its amendments
# can be about a completely different topic — observed: a weak match on an
# unrelated "vehicle condition" article flooded context with 5 amendments
# about towing/registration when the actual question was about a traffic-
# signal fine, and the generator gave up rather than sort through the noise.
#
# Cosine similarity was tried first and rejected — calibration showed a
# genuinely relevant khoản (0.23) and an irrelevant one (0.25) landing on
# the wrong sides of any single threshold, indistinguishable at this
# granularity. This is the same lesson subchunk.py already learned for
# khoản selection (see its own comment) — short, dense Vietnamese legal
# clauses need an LLM read, not embedding distance, at this granularity.
RELEVANCE_FILTER_PROMPT = """Bạn nhận được một câu hỏi pháp luật giao thông và một số đoạn nội dung \
sửa đổi/bổ sung (mỗi đoạn đánh số). Với mỗi đoạn, xác định đoạn đó có THỰC SỰ liên quan trực tiếp đến \
câu hỏi hay không (cùng hành vi vi phạm / chủ đề được hỏi đến) — KHÔNG tính là liên quan chỉ vì đoạn đó \
nằm trong cùng văn bản sửa đổi, nếu nội dung cụ thể của đoạn nói về một Điều/khoản/chủ đề khác.

Trả lời DUY NHẤT một JSON hợp lệ, không markdown: {"relevant": [<các số thứ tự đoạn liên quan>]}"""

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


@traceable(name="filter_supersession_relevance", run_type="chain")
def _filter_relevant(question: str, texts: list[str]) -> set[int]:
    """Indices (1-based) of `texts` the LLM judges actually relevant to
    `question`. One batched call for all candidates in a query, not one
    call per candidate. Fails OPEN (returns all indices) on any error —
    a missed filter costs some noise, same as before this existed; a
    false drop costs a real answer, which is worse."""
    if not texts:
        return set()
    listing = "\n\n".join(f"[{i}] {t[:400]}" for i, t in enumerate(texts, start=1))
    llm = ChatOpenAI(model=RELEVANCE_MODEL, temperature=0, max_tokens=200, timeout=15, max_retries=2)
    messages = [
        SystemMessage(content=RELEVANCE_FILTER_PROMPT),
        HumanMessage(content=f"Câu hỏi: {question}\n\n{listing}"),
    ]
    try:
        response = llm.invoke(messages)
        usage.record_response("relevance_filter", RELEVANCE_MODEL, response)
        raw = _JSON_FENCE_RE.sub("", response.content).strip()
        data = json.loads(raw)
        indices = {int(i) for i in data.get("relevant", [])}
        return {i for i in indices if 1 <= i <= len(texts)}
    except Exception:
        return set(range(1, len(texts) + 1))


@lru_cache(maxsize=1)
def load_khoan_relations(path: Path = RELATIONS_PATH) -> list[KhoanRelation]:
    if not path.exists():
        return []
    import json

    data = json.loads(path.read_text(encoding="utf-8"))
    return [KhoanRelation(**item) for item in data]


@lru_cache(maxsize=1)
def _corpus_index(path: Path = CORPUS_PATH) -> dict[str, ArticleChunk]:
    """chunk_id -> ArticleChunk for every chunk, including khoản-level ones
    that live only in corpus.jsonl (never embedded/indexed — see
    load_vectorstore.py) — supersession needs to fetch a specific amending
    khoản's exact text by id, not search for it."""
    chunks = [
        ArticleChunk.model_validate_json(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    return {c.chunk_id: c for c in chunks}


def get_chunk_by_id(chunk_id: str) -> ArticleChunk | None:
    return _corpus_index().get(chunk_id)


def find_supersessions_for_article(article_chunk_id: str) -> list[KhoanRelation]:
    """Resolved khoản-level edges whose target khoản belongs to this
    article — i.e. "this Điều, retrieved as a whole, has at least one
    khoản inside it that a later document has specifically amended"."""
    prefix = article_chunk_id + "::khoan_"
    return [
        edge
        for edge in load_khoan_relations()
        if edge.resolved and edge.to_chunk_id and edge.to_chunk_id.startswith(prefix)
    ]


def _format_fine(chunk: ArticleChunk) -> str:
    if chunk.fine_min is not None:
        return f"{chunk.fine_min:,}–{chunk.fine_max:,}đ".replace(",", ".")
    return f"đến {chunk.fine_max:,}đ".replace(",", ".")


def build_fine_change_note(old: ArticleChunk, new: ArticleChunk) -> str | None:
    """A ready-made, numerically-verified old->new comparison string — the
    whole point of Phase 2's fine_min/fine_max fields existing at all. None
    when either side has no extracted amount, or when both amounts are
    identical (an amendment that changed wording but not the fine itself)."""
    if old.fine_max is None or new.fine_max is None:
        return None
    if old.fine_min == new.fine_min and old.fine_max == new.fine_max:
        return None
    return f"Mức phạt: {_format_fine(old)} (quy định cũ) → {_format_fine(new)} (quy định hiện hành)"


def _to_retrieved_chunk(chunk: ArticleChunk):
    # Imported lazily to avoid a circular import (retriever.py imports this
    # module to call apply_supersession).
    from rag.retrieval.retriever import RetrievedChunk

    return RetrievedChunk(
        chunk_id=chunk.chunk_id,
        text=chunk.text,
        doc_id=chunk.doc_id,
        doc_type=chunk.doc_type.value,
        doc_title=chunk.doc_title,
        article_number=chunk.article_number,
        article_heading=chunk.article_heading or "",
        chunk_type=chunk.chunk_type,
        needs_review=chunk.needs_review,
        source_file=chunk.source_file,
    )


def apply_supersession(chunks: list, seen_chunk_ids: set[str], question: str) -> list:
    """For every retrieved "article" chunk that Phase 3 knows has at least
    one khoản amended by a later document: gate on relevance to THIS query
    (a retrieved article can be a weak/borderline overall match whose
    amendments are about a different topic entirely — see _filter_relevant),
    then mark the survivors superseded and inject the amending khoản(s)'
    exact text directly (a chunk_id lookup — not a fresh semantic/BM25
    search like the existing amendment-context mechanism), with a numeric
    fine-amount comparison already computed. Deterministic on top of the
    existing heuristic amendment injection, not a replacement for it — this
    only fires where Phase 3 actually resolved a link; retrieve() still
    falls back to the semantic-search-based amendment context everywhere
    else."""
    candidates: list[tuple[ArticleChunk, KhoanRelation, ArticleChunk, ArticleChunk | None]] = []
    for chunk in chunks:
        if chunk.chunk_type != "article":
            continue
        for edge in find_supersessions_for_article(chunk.chunk_id):
            if edge.from_chunk_id in seen_chunk_ids:
                continue
            amending = get_chunk_by_id(edge.from_chunk_id)
            if amending is None:
                continue
            original = get_chunk_by_id(edge.to_chunk_id) if edge.to_chunk_id else None
            candidates.append((chunk, edge, amending, original))

    if not candidates:
        return []

    relevant_indices = _filter_relevant(question, [c[2].text for c in candidates])

    extra = []
    marked: set[str] = set()
    for i, (chunk, edge, amending, original) in enumerate(candidates, start=1):
        if i not in relevant_indices:
            continue
        if chunk.chunk_id not in marked:
            chunk.superseded_by_chunk_id = edge.to_chunk_id
            marked.add(chunk.chunk_id)

        rc = _to_retrieved_chunk(amending)
        rc.is_amendment_context = True
        rc.amends_doc_id = chunk.doc_id
        rc.supersedes_chunk_id = edge.to_chunk_id
        rc.score = 0.0
        if original is not None:
            rc.fine_change_note = build_fine_change_note(original, amending)
        extra.append(rc)
        seen_chunk_ids.add(rc.chunk_id)

    return extra
