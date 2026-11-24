"""Retrieval sub-units for long Điều — built at index time, never persisted.

The embedding model (bkai, PhoBERT) reads at most 256 tokens; ~38% of the
corpus' Điều are longer and were silently truncated, so e.g. ND 168 Điều 7
(~13.5k chars, dozens of violations) was embedded from its first khoản only.
Every Điều longer than the limit is therefore ALSO indexed as smaller units:

  1. its khoản (the existing "khoan" chunks for traffic docs; split on the
     fly with split_khoan for docs that never got khoan chunks — Civil /
     Penal codes and their procedure codes);
  2. a khoản that is still too long is split into groups of điểm a), b)...
     each prefixed with the khoản's lead sentence (it carries the fine
     bracket / penalty);
  3. a block with no khoản/điểm structure falls back to overlapping word
     windows.

Each unit is prefixed with "<doc title>, Điều N. <heading>" (a bare khoản
says "người điều khiển xe" without saying WHICH vehicle) and carries its
parent Điều in parent_chunk_id, so retrieval can map hits back to the Điều.

Kept out of corpus.jsonl on purpose: the "khoan" chunks there are the stable
ids fine_amount / khoan_relations / supersession attach data to, and
khoan_split.split_corpus_khoan regenerates them wholesale. Validated in
scripts/experiments/exp_khoan_chunks.py (investigation/embedding_process/).
"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Callable

from ingestion.chunking.khoan_split import split_khoan
from ingestion.models import ArticleChunk

MAX_TOKENS = 254          # model limit is 256 incl. special tokens
PIECE_TOKENS = 200        # target size for one unit (header included)
HEADER_MAX_CHARS = 160
LEAD_MAX_WORDS = 60
WINDOW_WORDS, WINDOW_STEP, WINDOW_TAIL = 150, 110, 40
DIEM_RE = re.compile(r"(?m)^\s*([a-zđ])\)\s+")


def unit_header(chunk: ArticleChunk) -> str:
    heading = (chunk.article_heading or "").strip()
    return f"{chunk.doc_title}, Điều {chunk.article_number}. {heading}"[:HEADER_MAX_CHARS]


def _split_long(text: str, n_tokens: Callable[[str], int], budget: int) -> list[str]:
    marks = list(DIEM_RE.finditer(text))
    if len(marks) >= 2:
        lead = " ".join(text[: marks[0].start()].split()[:LEAD_MAX_WORDS])
        diems = [text[m.start(): (marks[i + 1].start() if i + 1 < len(marks) else len(text))].strip()
                 for i, m in enumerate(marks)]
        pieces, cur = [], []
        for d in diems:
            if cur and n_tokens("\n".join([lead, *cur, d])) > budget:
                pieces.append("\n".join([lead, *cur]))
                cur = [d]
            else:
                cur.append(d)
        if cur:
            pieces.append("\n".join([lead, *cur]))
        return pieces
    words = text.split()
    return [" ".join(words[i: i + WINDOW_WORDS])
            for i in range(0, max(1, len(words) - WINDOW_TAIL), WINDOW_STEP)]


def build_retrieval_units(corpus: list[ArticleChunk], n_tokens: Callable[[str], int]) -> list[ArticleChunk]:
    existing_khoan: dict[str, list[ArticleChunk]] = {}
    for c in corpus:
        if c.chunk_type == "khoan" and c.parent_chunk_id:
            existing_khoan.setdefault(c.parent_chunk_id, []).append(c)

    units: list[ArticleChunk] = []
    for art in corpus:
        if art.chunk_type != "article" or n_tokens(art.embedding_text or art.text) <= MAX_TOKENS:
            continue
        header = unit_header(art)
        if art.chunk_id in existing_khoan:
            khoans = [(k.khoan_number, k.text) for k in existing_khoan[art.chunk_id]]
        else:
            khoans = [(s.khoan_number, s.text) for s in split_khoan(art.text)] or [(None, art.text)]
        budget = PIECE_TOKENS - n_tokens(header)
        for ki, (khoan_number, ktext) in enumerate(khoans):
            pieces = [ktext] if n_tokens(ktext) <= budget else _split_long(ktext, n_tokens, budget)
            for pi, piece in enumerate(pieces):
                # Position first: khoản numbers can repeat inside one Điều
                # (nested numbered lists match the khoản regex too), so the
                # number alone isn't a unique id.
                base = f"{ki:02d}_k{khoan_number}" if khoan_number is not None else f"{ki:02d}"
                suffix = base if len(pieces) == 1 else f"{base}_p{pi}"
                units.append(art.model_copy(update={
                    "chunk_id": f"{art.chunk_id}::sub_{suffix}",
                    "text": f"{header}\n{piece}",
                    "chunk_type": "subchunk",
                    "khoan_number": khoan_number,
                    "parent_chunk_id": art.chunk_id,
                    "embedding_text": None,
                    "fine_min": None,
                    "fine_max": None,
                }))
    return units


@lru_cache(maxsize=1)
def get_retrieval_units() -> tuple[ArticleChunk, ...]:
    """Units for the shipped corpus, tokenized with the embedding model's own
    tokenizer (the 256-token limit is in its tokens). Cached for the process;
    deterministic, so the BM25 index built at API startup and the Chroma
    collection built by load_vectorstore agree on the same unit ids."""
    from ingestion.index.embed import get_embedding_model
    from ingestion.index.load_vectorstore import load_corpus

    tokenizer = get_embedding_model().tokenizer
    return tuple(build_retrieval_units(load_corpus(), lambda s: len(tokenizer.tokenize(s))))
