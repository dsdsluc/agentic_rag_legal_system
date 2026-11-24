from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

from langsmith import traceable

from ingestion.index.embed import embed_texts
from ingestion.index.vectorstore import get_collection

from rag.retrieval.bm25_index import bm25_search
from rag.input.domain_classify import ALL_DOMAINS
from rag.retrieval.graph import find_amending_doc_ids, traverse_graph
from rag.retrieval.rerank import RERANK_POOL, rerank, rerank_is_available
from rag.retrieval.subchunk import MIN_LEN_FOR_TRIM, find_best_khoan, split_khoan
from rag.retrieval.supersession import _filter_relevant, apply_supersession

DEFAULT_TOP_K = 5
FUSION_CANDIDATE_K = 20
# Long Điều are also indexed as several "subchunk" units (one per khoản /
# điểm group — ingestion/index/retrieval_units.py), so the raw dense/BM25 hit list
# can hold many units of the same Điều. Over-fetch units, map each to its
# parent Điều, de-duplicate in rank order, and keep FUSION_CANDIDATE_K Điều.
UNIT_OVERFETCH = 15
RRF_K = 60
AMENDMENT_CONTEXT_K = 2
GRAPH_CONTEXT_K = 2
GRAPH_MAX_HOPS = 2
# Raised from 200 when sub-units were added to the BM25 index (they now take
# a share of the top hits) — keeps the scoped search's reach roughly the same.
BM25_FILTER_POOL = 400


@dataclass
class RetrievedChunk:
    chunk_id: str
    text: str
    doc_id: str
    doc_type: str
    doc_title: str
    article_number: Optional[int]
    article_heading: str
    chunk_type: str
    needs_review: bool
    source_file: str
    # "" for any pre-multi-domain corpus edge case (should not happen post
    # ingestion migration, but never a reason to crash retrieval over).
    domain: str = ""
    dense_rank: Optional[int] = None
    bm25_rank: Optional[int] = None
    score: float = 0.0
    is_amendment_context: bool = False
    amends_doc_id: Optional[str] = None
    graph_hop: Optional[int] = None
    graph_relation: Optional[str] = None
    trimmed_to_khoan: Optional[int] = None
    trim_similarity: Optional[float] = None
    # Deterministic khoản-level supersession (Phase 3/4 data — khoan_relations.json),
    # not the semantic-search-based amendment injection above: set on the OLD
    # chunk when a specific khoản inside it is known to have been superseded,
    # and on the NEW injected chunk to point back at what it replaces.
    superseded_by_chunk_id: Optional[str] = None
    supersedes_chunk_id: Optional[str] = None
    fine_change_note: Optional[str] = None


# "template" chunks are blank administrative form boilerplate (e.g. a Mẫu
# Quyết định appended after a decree's real content) — not substantive legal
# text, and their generic phrasing ("có hiệu lực thi hành kể từ ngày ký")
# false-matches unrelated queries (observed: polluted an effective-date
# question with a wrong document/date). Excluded from all retrieval.
_EXCLUDE_TEMPLATE = {"chunk_type": {"$ne": "template"}}

def _dense_search(question: str, top_k: int, collection=None, where: Optional[dict] = None) -> list[tuple[str, dict, str]]:
    collection = collection or get_collection()
    embedding = embed_texts([question])
    result = collection.query(query_embeddings=embedding, n_results=top_k, where=where or _EXCLUDE_TEMPLATE)
    if not result["ids"] or not result["ids"][0]:
        return []
    return list(zip(result["ids"][0], result["metadatas"][0], result["documents"][0]))


def _chunk_from_dense(chunk_id: str, meta: dict, text: str) -> RetrievedChunk:
    article_number = meta.get("article_number")
    return RetrievedChunk(
        chunk_id=chunk_id,
        text=text,
        doc_id=meta.get("doc_id", ""),
        doc_type=meta.get("doc_type", ""),
        doc_title=meta.get("doc_title", ""),
        article_number=article_number if article_number not in (None, -1) else None,
        article_heading=meta.get("article_heading", ""),
        chunk_type=meta.get("chunk_type", ""),
        needs_review=bool(meta.get("needs_review", False)),
        source_file=meta.get("source_file", ""),
        domain=meta.get("domain", ""),
    )


@lru_cache(maxsize=1)
def _corpus_by_id() -> dict:
    from ingestion.index.load_vectorstore import load_corpus

    return {c.chunk_id: c for c in load_corpus()}


def _parent_of(chunk_id: str, parent_chunk_id: Optional[str]) -> str:
    return parent_chunk_id or chunk_id


def _chunk_from_parent(parent_id: str) -> Optional[RetrievedChunk]:
    """The Điều a sub-unit hit belongs to, as a RetrievedChunk (full Điều
    text — the generator and khoản trimming work on whole Điều, as before)."""
    parent = _corpus_by_id().get(parent_id)
    return _chunk_from_bm25(parent) if parent is not None else None


def _dedupe_to_parents(hits: list[tuple[str, Optional[str]]], limit: int) -> list[str]:
    """(unit_id, parent_id) in rank order -> first `limit` distinct parent ids."""
    seen: list[str] = []
    for unit_id, parent_id in hits:
        pid = _parent_of(unit_id, parent_id)
        if pid not in seen:
            seen.append(pid)
            if len(seen) >= limit:
                break
    return seen


def _chunk_from_bm25(chunk) -> RetrievedChunk:
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
        domain=chunk.domain.value,
    )


@traceable(name="hybrid_fusion", run_type="chain")
def _fused_search(
    queries: list[str],
    top_k: int,
    collection=None,
    where: Optional[dict] = None,
    domains: Optional[list[str]] = None,
) -> list[RetrievedChunk]:
    """RRF-fuse dense+BM25 results across one or more query phrasings, so a
    chunk that ranks well under any phrasing (e.g. a formal-legal synonym
    rewrite) contributes, not just the user's original wording.

    `where` scopes the Chroma dense search (domain filter folded in here,
    same mechanism as the existing template exclusion). `domains`, when
    given, additionally drops BM25 candidates outside that set — BM25 has
    no metadata `where` clause of its own, so this is a post-hoc filter
    instead."""
    candidates: dict[str, RetrievedChunk] = {}
    rrf_scores: dict[str, float] = {}

    overfetch = FUSION_CANDIDATE_K * UNIT_OVERFETCH
    for query in queries:
        dense_raw = _dense_search(query, overfetch, collection=collection, where=where)
        bm25_raw = bm25_search(query, overfetch)
        if domains:
            bm25_raw = [(c, s) for c, s in bm25_raw if c.domain.value in domains]

        # Rank lists are over parent Điều (sub-unit hits folded into their
        # Điều, best unit's rank wins) so a Điều split into 30 units can't
        # crowd the other candidates out, and RRF sees one entry per Điều.
        dense_meta = {cid: (meta, text) for cid, meta, text in dense_raw}
        dense_ids = _dedupe_to_parents(
            [(cid, meta.get("parent_chunk_id") or None) for cid, meta, _ in dense_raw], FUSION_CANDIDATE_K)
        bm25_ids = _dedupe_to_parents(
            [(c.chunk_id, c.parent_chunk_id if c.chunk_type == "subchunk" else None) for c, _ in bm25_raw],
            FUSION_CANDIDATE_K)

        for source, ranked_ids in (("dense", dense_ids), ("bm25", bm25_ids)):
            for rank, chunk_id in enumerate(ranked_ids, start=1):
                if chunk_id not in candidates:
                    rc = _chunk_from_parent(chunk_id)
                    if rc is None and chunk_id in dense_meta:
                        rc = _chunk_from_dense(chunk_id, *dense_meta[chunk_id])
                    if rc is None:
                        continue
                    candidates[chunk_id] = rc
                attr = "dense_rank" if source == "dense" else "bm25_rank"
                existing = getattr(candidates[chunk_id], attr)
                setattr(candidates[chunk_id], attr, rank if existing is None else min(existing, rank))
                rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank)

    for chunk_id, score in rrf_scores.items():
        candidates[chunk_id].score = score

    return sorted(candidates.values(), key=lambda c: c.score, reverse=True)[:top_k]


def _scoped_context_search(
    question: str, doc_id: str, exclude_chunk_ids: set[str], k: int, collection=None
) -> list[RetrievedChunk]:
    """Dense+BM25 search restricted to one document — used to pull in the
    most relevant chunk(s) from a document reached via the relation graph
    (an amendment, or a broader multi-hop neighbor), rather than the whole
    document."""
    coll = collection or get_collection()
    embedding = embed_texts([question])
    # Whole Điều only (no "subchunk" units) — this path returns its hits
    # directly as context, unchanged from before sub-units were indexed.
    scoped = coll.query(
        query_embeddings=embedding,
        n_results=k,
        where={"$and": [{"doc_id": doc_id}, {"chunk_type": {"$nin": ["template", "subchunk"]}}]},
    )
    merged: dict[str, RetrievedChunk] = {}
    if scoped["ids"] and scoped["ids"][0]:
        for chunk_id, meta, text in zip(scoped["ids"][0], scoped["metadatas"][0], scoped["documents"][0]):
            merged[chunk_id] = _chunk_from_dense(chunk_id, meta, text)

    all_bm25 = bm25_search(question, top_k=BM25_FILTER_POOL)
    for chunk, _score in all_bm25:
        if chunk.doc_id == doc_id and chunk.chunk_type != "subchunk":
            merged.setdefault(chunk.chunk_id, _chunk_from_bm25(chunk))
        if len(merged) >= k * 2:
            break

    return [rc for chunk_id, rc in merged.items() if chunk_id not in exclude_chunk_ids][:k]


@traceable(name="amendment_graph_expansion", run_type="chain")
def _amendment_context(
    question: str, doc_id: str, exclude_chunk_ids: set[str], collection=None
) -> list[RetrievedChunk]:
    results = _scoped_context_search(question, doc_id, exclude_chunk_ids, AMENDMENT_CONTEXT_K, collection)
    for rc in results:
        rc.is_amendment_context = True
        rc.score = 0.0
    return results


@traceable(name="relation_graph_expansion", run_type="chain")
def _graph_hop_context(
    question: str,
    doc_id: str,
    hop: int,
    relation_type: str,
    exclude_chunk_ids: set[str],
    collection=None,
) -> list[RetrievedChunk]:
    results = _scoped_context_search(question, doc_id, exclude_chunk_ids, GRAPH_CONTEXT_K, collection)
    for rc in results:
        rc.graph_hop = hop
        rc.graph_relation = relation_type
        rc.score = 0.0
    return results


@traceable(name="hybrid_retrieve", run_type="retriever")
def retrieve(
    question: str,
    top_k: int = DEFAULT_TOP_K,
    collection=None,
    include_amendments: bool = True,
    use_graph_expansion: bool = False,
    graph_max_hops: int = GRAPH_MAX_HOPS,
    # Validated on eval (9/9, 5.00/5 faithfulness) and against a real
    # multi-violation article, where the untrimmed path cited a wrong
    # khoản's fine outright — not a precision nice-to-have, a correctness
    # fix. See the matching comment on api/schemas.py's QueryRequest.
    trim_context: bool = True,
    # Subject-matter domains (giao_thong/dan_su/hinh_su — see
    # rag/input/domain_classify.py) to scope the PRIMARY search to. None or all 3
    # means "no filter, search everything" (today's behavior, and the safe
    # fallback when the classifier itself isn't confident) — only narrows
    # when genuinely restrictive. Amendment/graph expansion below is
    # deliberately NOT domain-filtered: a traffic decree can legitimately
    # link to a Civil Code compensation article, and the relation graph
    # already encodes that it's relevant.
    domains: Optional[list[str]] = None,
    # Cross-encoder rerank of the fused pool (rag/retrieval/rerank.py). On by default
    # since measured (Hit@5 87% -> 90%, MRR 0.72 -> 0.81); silently off when
    # the model isn't installed.
    use_rerank: bool = True,
    # Khoản-level supersession injection at the end (may call the LLM
    # relevance filter). Always on in production; the retrieval eval turns it
    # off — it only appends extra chunks AFTER the ranked top_k, so it can't
    # change ranking metrics, and it keeps the eval free of OpenAI calls.
    apply_supersession_links: bool = True,
) -> list[RetrievedChunk]:
    """Hybrid retrieval: fuse dense (Chroma embedding) and sparse (BM25 keyword)
    candidate rankings via Reciprocal Rank Fusion, so an exact keyword match
    (e.g. "hiệu lực thi hành") isn't lost when a verbose natural-language
    question dilutes the dense embedding.

    Searches with the question as asked. (An LLM query-rewrite step and its
    hand-written vehicle-type rules used to expand it into several phrasings;
    removed 2026-11-24 — with word-segmented embeddings + the reranker it
    added 1/70 on the retrieval eval for ~2 s per question. See
    investigation/input_processing/inpect.txt.)

    When include_amendments is set (default on — this is the highest-confidence
    graph relation), also pull in a couple of chunks from any document that
    amends ("sửa đổi, bổ sung") a retrieved document — e.g. a fine amount in
    Nghị định 168/2024 may have been changed by Nghị định 238/2026, and
    answering from the original alone would be stale.

    When use_graph_expansion is set (default off — pulls in more tokens for
    a lower-confidence signal than amendments, so it's opt-in pending eval
    results), also walk the full relation graph (guided-by, related-to, plus
    amendments) up to graph_max_hops out from the retrieved documents, e.g.
    a question about a Luật provision can also surface the Nghị định that
    implements it.

    All expansion chunks are appended beyond top_k, not counted against it.

    When trim_context is set (default on, since validated — see the field
    comment on the default), large multi-violation Điều chunks (e.g.
    ND_168_2024's per-vehicle-type articles, which run 13-19KB covering
    16+ unrelated violations) get trimmed down to just the khoản (clause)
    that best matches the question, instead of sending the whole article —
    precision and token cost together, not "retrieve more". Falls back to
    the full article text when the match isn't confident but the article is
    still eligible for trimming (has khoản structure), and drops the
    article from context entirely when the model has confidently read every
    khoản and found none relevant — sending the whole thing anyway in that
    case was proven to actively hurt (drowns out the chunk that IS
    relevant), not just waste tokens.
    """
    queries = [question]
    effective_top_k = top_k
    restrictive_domains = domains if domains and len(domains) < len(ALL_DOMAINS) else None
    dense_where = (
        {"$and": [_EXCLUDE_TEMPLATE, {"domain": {"$in": restrictive_domains}}]}
        if restrictive_domains
        else _EXCLUDE_TEMPLATE
    )
    # With rerank: fuse a wider pool (RERANK_POOL Điều), let the
    # cross-encoder pick the best effective_top_k. Without (disabled, or the
    # model isn't installed): the fused top effective_top_k, as before.
    reranker_on = use_rerank and rerank_is_available()
    pool_k = max(RERANK_POOL, effective_top_k) if reranker_on else effective_top_k
    result_chunks = _fused_search(
        queries, pool_k, collection=collection, where=dense_where, domains=restrictive_domains
    )
    if reranker_on:
        result_chunks = rerank(question, result_chunks, effective_top_k, collection=collection)

    if trim_context:
        trim_query = question
        trim_targets = [c for c in result_chunks if c.chunk_type == "article"]
        if trim_targets:
            # Each candidate's khoản-selection is an independent LLM call —
            # run them concurrently instead of one-by-one, since a query with
            # several large-article candidates would otherwise pay for each
            # trim sequentially.
            with ThreadPoolExecutor(max_workers=min(8, len(trim_targets))) as pool:
                futures = {
                    pool.submit(
                        find_best_khoan,
                        chunk.text,
                        trim_query,
                        f"Điều {chunk.article_number}. {chunk.article_heading or ''}".strip(),
                    ): chunk
                    for chunk in trim_targets
                }
                irrelevant_chunk_ids: set[str] = set()
                for future, chunk in futures.items():
                    match = future.result()
                    if match:
                        excerpt, khoan_number, similarity = match
                        chunk.text = excerpt
                        chunk.trimmed_to_khoan = khoan_number
                        chunk.trim_similarity = similarity
                    elif len(chunk.text) >= MIN_LEN_FOR_TRIM and split_khoan(chunk.text):
                        # find_best_khoan's own prompt only returns "no
                        # match" when it read every khoản and confidently
                        # found none relevant — the fallback used to be
                        # "keep the whole untrimmed article" on the theory
                        # that narrowing might be wrong, but a large
                        # article the model has already ruled irrelevant
                        # doesn't become useful by including it whole — it
                        # just drowns out the chunk that IS relevant.
                        # Observed: a "vehicle condition" article with zero
                        # khoản about the actual violation asked about
                        # still got included in full (untrimmed, ~9KB) and
                        # buried the correct article further down in
                        # context, and the generator gave up rather than
                        # find it. Dropping it here is strictly narrower,
                        # same guarantee the trim path already claims.
                        irrelevant_chunk_ids.add(chunk.chunk_id)

                if irrelevant_chunk_ids:
                    still_relevant = [c for c in result_chunks if c.chunk_id not in irrelevant_chunk_ids]
                    if still_relevant:
                        result_chunks = still_relevant

    seen_doc_ids = {c.doc_id for c in result_chunks}
    seen_chunk_ids = {c.chunk_id for c in result_chunks}
    extra: list[RetrievedChunk] = []

    if include_amendments:
        amend_targets = [
            (doc_id, amending_doc_id)
            for doc_id in list(seen_doc_ids)
            for amending_doc_id in find_amending_doc_ids(doc_id)
            if amending_doc_id not in seen_doc_ids
        ]
        if amend_targets:
            # Post-hoc dedup against seen_chunk_ids below rather than
            # threading a mutable exclusion set through concurrent calls —
            # each scoped search is independent and small (top-2 per doc),
            # so an occasional duplicate slipping past a stale snapshot costs
            # nothing beyond a redundant chunk, never a wrong one.
            with ThreadPoolExecutor(max_workers=min(8, len(amend_targets))) as pool:
                futures = {
                    pool.submit(
                        _amendment_context, question, amending_doc_id, seen_chunk_ids, collection
                    ): (doc_id, amending_doc_id)
                    for doc_id, amending_doc_id in amend_targets
                }
                candidates: list[tuple[str, RetrievedChunk]] = [
                    (doc_id, rc)
                    for future, (doc_id, amending_doc_id) in futures.items()
                    for rc in future.result()
                ]

            # _scoped_context_search always returns up to AMENDMENT_CONTEXT_K
            # chunks per amending doc — vector search has no "nothing close
            # enough" concept, it returns nearest neighbors regardless of
            # absolute relevance. Gate on relevance to THIS query before
            # injecting: an amendment marked [SỬA ĐỔI, BỔ SUNG cho X] carries
            # real weight in the prompt (told to trust it over X on
            # conflict) — an irrelevant one doesn't just waste tokens, it
            # actively confused the generator into distrusting a correct
            # answer it already had (observed: injected content about
            # unrelated GPS-device/rescue-vehicle amendments made the model
            # refuse to answer a traffic-signal-fine question it could
            # otherwise answer cleanly).
            relevant_indices = _filter_relevant(question, [rc.text for _, rc in candidates])
            for i, (doc_id, rc) in enumerate(candidates, start=1):
                if i not in relevant_indices:
                    continue
                rc.amends_doc_id = doc_id
                if rc.chunk_id not in seen_chunk_ids:
                    extra.append(rc)
                    seen_chunk_ids.add(rc.chunk_id)

            for _, amending_doc_id in amend_targets:
                seen_doc_ids.add(amending_doc_id)

    if use_graph_expansion:
        hits = [h for h in traverse_graph(seen_doc_ids, max_hops=graph_max_hops) if h.doc_id not in seen_doc_ids]
        if hits:
            with ThreadPoolExecutor(max_workers=min(8, len(hits))) as pool:
                futures = {
                    pool.submit(
                        _graph_hop_context,
                        question,
                        hit.doc_id,
                        hit.hop,
                        hit.relation_type,
                        seen_chunk_ids,
                        collection,
                    ): hit
                    for hit in hits
                }
                for future, hit in futures.items():
                    for rc in future.result():
                        if rc.chunk_id not in seen_chunk_ids:
                            extra.append(rc)
                            seen_chunk_ids.add(rc.chunk_id)
                    seen_doc_ids.add(hit.doc_id)

    # Deterministic khoản-level supersession (khoan_relations.json) — fires
    # only where Phase 3 actually resolved a link, on top of (not instead
    # of) the semantic-search-based amendment injection above.
    if apply_supersession_links:
        extra.extend(apply_supersession(result_chunks, seen_chunk_ids, question))

    return result_chunks + extra
