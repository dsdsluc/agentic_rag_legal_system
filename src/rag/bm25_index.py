from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from rank_bm25 import BM25Okapi

from ingestion.load_vectorstore import CORPUS_PATH, load_corpus
from ingestion.models import ArticleChunk

_TOKEN_RE = re.compile(r"\w+", re.UNICODE)


def tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


@dataclass
class Bm25Index:
    chunks: list[ArticleChunk]
    bm25: BM25Okapi


@lru_cache(maxsize=1)
def get_bm25_index(corpus_path: Path = CORPUS_PATH) -> Bm25Index:
    # "template" chunks (blank administrative form boilerplate) are excluded
    # here too, matching the dense-search filter in retriever.py — their
    # generic phrasing otherwise false-matches unrelated keyword queries.
    # "khoan" chunks (structural sub-records from khoan_split.py, not yet
    # embedded — see load_vectorstore.py) are excluded for the same reason
    # dense search never sees them: not ready to be retrieved directly yet.
    chunks = [c for c in load_corpus(corpus_path) if c.chunk_type not in ("template", "khoan")]
    tokenized = [tokenize(c.embedding_text or c.text) for c in chunks]
    return Bm25Index(chunks=chunks, bm25=BM25Okapi(tokenized))


def bm25_search(
    question: str, top_k: int, corpus_path: Path = CORPUS_PATH
) -> list[tuple[ArticleChunk, float]]:
    index = get_bm25_index(corpus_path)
    scores = index.bm25.get_scores(tokenize(question))
    ranked_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_k]
    return [(index.chunks[i], scores[i]) for i in ranked_indices if scores[i] > 0]
