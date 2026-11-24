"""Cross-encoder reranking of the fused candidate Điều.

Dense+BM25 fusion (RRF) finds the right Điều for ~99% of questions within
its top 20, but often not in the top 5 the generator sees (e.g. "vượt đèn
đỏ xe máy": ND 168 Điều 7 sat at rank 11–12 — the reason the chat answered
"không tìm thấy"). A cross-encoder reads question and passage TOGETHER, so it
scores "vượt đèn đỏ" against "không chấp hành hiệu lệnh của đèn tín hiệu"
far better than comparing two independent embeddings.

Locked configuration (investigation/embedding_process/re-rank.txt):
BAAI/bge-reranker-v2-m3, FP16 on GPU, max 256 tokens; a long Điều is scored
on its 5 sub-units most similar to the question (by the embeddings already
in Chroma) and takes the MAX; short Điều on their own text; final order is
the reranker score alone. Measured: Hit@5 87% -> 90% (+ word segmentation
-> 96%), ~0.6 s per question on an RTX 5050.

Fails OPEN: if the model directory is missing or scoring raises, the fused
order is kept — rerank improves ranking, it must never take retrieval down.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Optional

import numpy as np
from langsmith import traceable

if TYPE_CHECKING:
    from rag.retrieval.retriever import RetrievedChunk

logger = logging.getLogger("legal_rag.rerank")

RERANKER_MODEL_NAME = "BAAI/bge-reranker-v2-m3"
RERANKER_DIR = Path(__file__).resolve().parents[3] / "models" / "bge-reranker-v2-m3"
RERANK_POOL = 20            # fused candidates handed to the reranker
UNITS_PER_ARTICLE = 5       # sub-units scored per long Điều
MAX_LENGTH = 256
BATCH_SIZE = 64


@lru_cache(maxsize=1)
def get_reranker():
    """None when the model isn't installed — callers then skip reranking."""
    if not (RERANKER_DIR / "config.json").exists():
        logger.warning("reranker not found at %s — reranking disabled "
                       "(run `python scripts/download_models.py`)", RERANKER_DIR)
        return None
    import torch
    from sentence_transformers import CrossEncoder

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = CrossEncoder(str(RERANKER_DIR), max_length=MAX_LENGTH, device=device)
    if device == "cuda":
        model.model.half()
    return model


def _own_text(chunk: "RetrievedChunk") -> str:
    if chunk.chunk_type == "article":
        heading = (chunk.article_heading or "").strip()
        return f"{chunk.doc_title}, Điều {chunk.article_number}. {heading}\n{chunk.text}"
    return chunk.text


def _sub_units(question: str, parent_ids: list[str], collection) -> dict[str, list[str]]:
    """For each parent Điều, the texts of its UNITS_PER_ARTICLE sub-units
    closest to the question (dot product of the normalized embeddings already
    stored in Chroma — no extra embedding of the corpus)."""
    from ingestion.index.embed import embed_texts
    from ingestion.index.vectorstore import get_collection

    collection = collection or get_collection()
    got = collection.get(
        where={"parent_chunk_id": {"$in": parent_ids}},
        include=["embeddings", "documents", "metadatas"],
    )
    if not got["ids"]:
        return {}
    qvec = np.asarray(embed_texts([question])[0], dtype=np.float32)
    sims = np.asarray(got["embeddings"], dtype=np.float32) @ qvec
    by_parent: dict[str, list[tuple[float, str]]] = {}
    for sim, doc, meta in zip(sims, got["documents"], got["metadatas"]):
        by_parent.setdefault(meta["parent_chunk_id"], []).append((float(sim), doc))
    return {pid: [t for _, t in sorted(items, key=lambda x: -x[0])[:UNITS_PER_ARTICLE]]
            for pid, items in by_parent.items()}


@traceable(name="rerank", run_type="chain")
def rerank(question: str, chunks: list["RetrievedChunk"], top_k: int,
           collection=None) -> list["RetrievedChunk"]:
    """Reorder `chunks` (fused candidates, best first) by cross-encoder
    relevance to `question` and return the best `top_k`. Each returned
    chunk's `.score` becomes its reranker score."""
    if len(chunks) <= 1:
        return chunks[:top_k]
    model = get_reranker()
    if model is None:
        return chunks[:top_k]
    try:
        subs = _sub_units(question, [c.chunk_id for c in chunks], collection)
        pairs, owners = [], []
        for i, c in enumerate(chunks):
            for text in subs.get(c.chunk_id) or [_own_text(c)]:
                pairs.append((question, text))
                owners.append(i)
        scores = model.predict(pairs, batch_size=BATCH_SIZE, show_progress_bar=False)
    except Exception:
        logger.exception("rerank failed — keeping fused order")
        return chunks[:top_k]

    best: dict[int, float] = {}
    for i, s in zip(owners, scores):
        best[i] = max(best.get(i, float("-inf")), float(s))
    order = sorted(best, key=best.get, reverse=True)
    for i in order:
        chunks[i].score = best[i]
    return [chunks[i] for i in order[:top_k]]


def rerank_is_available() -> bool:
    return get_reranker() is not None


def warm_up() -> Optional[object]:
    """Load the model at API startup so the first request doesn't pay for it."""
    return get_reranker()
