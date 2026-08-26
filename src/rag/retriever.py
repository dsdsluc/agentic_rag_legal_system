from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Optional

from langsmith import traceable

from ingestion.embed import embed_texts
from ingestion.vectorstore import get_collection

from .bm25_index import bm25_search
from .domain_classify import ALL_DOMAINS
from .graph import find_amending_doc_ids, traverse_graph
from .query_rewrite import QueryIntent, rewrite_query
from .subchunk import MIN_LEN_FOR_TRIM, find_best_khoan, split_khoan
from .supersession import _filter_relevant, apply_supersession

DEFAULT_TOP_K = 5
FUSION_CANDIDATE_K = 20
RRF_K = 60
AMENDMENT_CONTEXT_K = 2
GRAPH_CONTEXT_K = 2
GRAPH_MAX_HOPS = 2
BM25_FILTER_POOL = 200


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

# ND_168's "xe máy CHUYÊN DÙNG" articles (Điều 8, 16 — self-propelled
# specialized machinery: road rollers, excavators etc., a legally distinct
# vehicle category) collide with plain "mô tô, xe gắn máy" (motorbike)
# queries even after query_rewrite consistently uses the formal term in
# every search phrase — the formal names themselves still share the "xe" +
# "máy" tokens, and dense embedding doesn't discriminate the two well
# either. Observed to outrank the actually-correct motorbike article
# entirely, silently producing the wrong fine amount (or the generator
# refusing to answer at all, given conflicting numbers). No citizen asking
# about "xe máy" means specialized machinery. Applies even when
# vehicle_type is None/ambiguous (not just once it's confidently resolved to
# something else) — dieu_8 genuinely has its own "đèn tín hiệu giao thông"
# khoản, so it's not just a token collision there, it's real topical
# overlap for a category virtually no citizen means by any colloquial
# vehicle question. Escape hatch: only kept in when the resolved
# vehicle_type itself says "chuyên dùng" — i.e. the user actually meant it.
_SPECIALIZED_MACHINERY_MARKER = "chuyên dùng"

# Same class of collision as the specialized-machinery one above, but
# between ND_168's xe đạp/xe đạp máy (bicycle) Điều and its mô tô/xe gắn
# máy (motorbike) Điều: BOTH have their OWN "không chấp hành hiệu lệnh của
# đèn tín hiệu giao thông" (red-light) clause, with DIFFERENT fine brackets
# (bicycle 150.000–250.000đ, motorbike 4.000.000–6.000.000đ) under
# DIFFERENT Điều. The violation phrase is verbatim-identical between them,
# so BM25 weights the exact-phrase match so heavily that the bicycle Điều
# can outrank — and push entirely out of top_k — the correct motorbike
# Điều (observed live: "Vượt đèn đỏ xe máy phạt bao nhiêu?" retrieved only
# the bicycle Điều and silently gave its fine as if it applied to xe máy).
# query_rewrite.py's _ensure_vehicle_term_present already makes every
# search phrase carry the formal vehicle term, but a few extra tokens
# aren't reliably enough to overcome BM25's exact-phrase weighting on their
# own — this deterministic post-fusion filter is the part that actually
# guarantees the fix, the same way the machinery filter above does.
_BICYCLE_HEADING_MARKER = "xe đạp"
_MOTORBIKE_HEADING_MARKERS = ("mô tô", "xe gắn máy")
_MOTORBIKE_VEHICLE_TYPE_MARKERS = ("mô tô", "xe gắn máy", "xe máy")


def _filter_wrong_vehicle_category(
    chunks: list["RetrievedChunk"], intent: Optional[QueryIntent]
) -> list["RetrievedChunk"]:
    vehicle_type = intent.vehicle_type if intent else None
    if vehicle_type and _SPECIALIZED_MACHINERY_MARKER in vehicle_type:
        return chunks
    filtered = [c for c in chunks if _SPECIALIZED_MACHINERY_MARKER not in (c.article_heading or "")]

    if vehicle_type and any(marker in vehicle_type for marker in _MOTORBIKE_VEHICLE_TYPE_MARKERS):
        without_bicycle = [c for c in filtered if _BICYCLE_HEADING_MARKER not in (c.article_heading or "")]
        filtered = without_bicycle or filtered
    elif vehicle_type and _BICYCLE_HEADING_MARKER in vehicle_type:
        without_motorbike = [
            c for c in filtered if not any(marker in (c.article_heading or "") for marker in _MOTORBIKE_HEADING_MARKERS)
        ]
        filtered = without_motorbike or filtered

    return filtered or chunks


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

    for query in queries:
        dense_results = _dense_search(query, FUSION_CANDIDATE_K, collection=collection, where=where)
        bm25_results = bm25_search(query, FUSION_CANDIDATE_K)
        if domains:
            bm25_results = [(c, s) for c, s in bm25_results if c.domain.value in domains]

        for rank, (chunk_id, meta, text) in enumerate(dense_results, start=1):
            if chunk_id not in candidates:
                candidates[chunk_id] = _chunk_from_dense(chunk_id, meta, text)
            existing = candidates[chunk_id].dense_rank
            candidates[chunk_id].dense_rank = rank if existing is None else min(existing, rank)
            rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank)

        for rank, (chunk, _score) in enumerate(bm25_results, start=1):
            chunk_id = chunk.chunk_id
            if chunk_id not in candidates:
                candidates[chunk_id] = _chunk_from_bm25(chunk)
            existing = candidates[chunk_id].bm25_rank
            candidates[chunk_id].bm25_rank = rank if existing is None else min(existing, rank)
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
    scoped = coll.query(
        query_embeddings=embedding,
        n_results=k,
        where={"$and": [{"doc_id": doc_id}, _EXCLUDE_TEMPLATE]},
    )
    merged: dict[str, RetrievedChunk] = {}
    if scoped["ids"] and scoped["ids"][0]:
        for chunk_id, meta, text in zip(scoped["ids"][0], scoped["metadatas"][0], scoped["documents"][0]):
            merged[chunk_id] = _chunk_from_dense(chunk_id, meta, text)

    all_bm25 = bm25_search(question, top_k=BM25_FILTER_POOL)
    for chunk, _score in all_bm25:
        if chunk.doc_id == doc_id:
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
    use_query_rewrite: bool = True,
    use_graph_expansion: bool = False,
    graph_max_hops: int = GRAPH_MAX_HOPS,
    intent: Optional[QueryIntent] = None,
    # Validated on eval (9/9, 5.00/5 faithfulness) and against a real
    # multi-violation article, where the untrimmed path cited a wrong
    # khoản's fine outright — not a precision nice-to-have, a correctness
    # fix. See the matching comment on api/schemas.py's QueryRequest.
    trim_context: bool = True,
    # Subject-matter domains (giao_thong/dan_su/hinh_su — see
    # rag/domain_classify.py) to scope the PRIMARY search to. None or all 3
    # means "no filter, search everything" (today's behavior, and the safe
    # fallback when the classifier itself isn't confident) — only narrows
    # when genuinely restrictive. Amendment/graph expansion below is
    # deliberately NOT domain-filtered: a traffic decree can legitimately
    # link to a Civil Code compensation article, and the relation graph
    # already encodes that it's relevant.
    domains: Optional[list[str]] = None,
) -> list[RetrievedChunk]:
    """Hybrid retrieval: fuse dense (Chroma embedding) and sparse (BM25 keyword)
    candidate rankings via Reciprocal Rank Fusion, so an exact keyword match
    (e.g. "hiệu lực thi hành") isn't lost when a verbose natural-language
    question dilutes the dense embedding.

    When use_query_rewrite is set, the question is first expanded into a few
    phrasings (including formal-legal-term synonyms) via rewrite_query, and
    all of them are fused together — bridges the gap between colloquial
    questions ("vượt đèn đỏ", "xe máy") and the formal terms decrees actually
    use ("không chấp hành hiệu lệnh của đèn tín hiệu giao thông", "mô tô, xe
    gắn máy") that neither BM25 nor the dense embedding closes on their own.

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

    Pass a pre-computed `intent` (from rewrite_query) when the caller already
    has one — e.g. generate.py extracts intent once for both retrieval and
    prompt construction, so retrieve() shouldn't pay for a second LLM call.

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
    if intent is None and use_query_rewrite:
        intent = rewrite_query(question)
    queries = intent.search_phrases if intent and intent.search_phrases else [question]

    # When the fine genuinely varies by vehicle type and the user didn't say
    # which, query_rewrite already fans out a search phrase per common
    # vehicle type — widen top_k here too, so those candidates don't have to
    # win against each other for a handful of slots sized for the single-
    # vehicle case. The answer needs to see each type's provision, not just
    # whichever one happened to rank highest.
    effective_top_k = top_k + 5 if intent and intent.vehicle_type_ambiguous else top_k
    restrictive_domains = domains if domains and len(domains) < len(ALL_DOMAINS) else None
    dense_where = (
        {"$and": [_EXCLUDE_TEMPLATE, {"domain": {"$in": restrictive_domains}}]}
        if restrictive_domains
        else _EXCLUDE_TEMPLATE
    )
    result_chunks = _fused_search(
        queries, effective_top_k, collection=collection, where=dense_where, domains=restrictive_domains
    )
    result_chunks = _filter_wrong_vehicle_category(result_chunks, intent)

    if trim_context:
        trim_query = (intent.violation if intent and intent.violation else question) or question
        trim_targets = [c for c in result_chunks if c.chunk_type == "article"]
        if trim_targets:
            # Each candidate's khoản-selection is an independent LLM call —
            # run them concurrently instead of one-by-one, since a query with
            # several large-article candidates (e.g. the vehicle-ambiguous
            # fan-out case) would otherwise pay for each trim sequentially.
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
    extra.extend(apply_supersession(result_chunks, seen_chunk_ids, question))

    return result_chunks + extra
