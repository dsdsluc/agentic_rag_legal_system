from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from .models import ArticleChunk

CORPUS_PATH = Path("data/processed/corpus.jsonl")

# Same boundary regex subchunk.py uses at query time to trim an Điều down to
# its relevant khoản. Kept here as the single source of truth — this module
# runs the split once at ingestion time so every khoản gets a stable
# chunk_id future phases (fine-amount extraction, khoản-level supersession
# links, effective-dating) can attach data to, instead of re-splitting the
# same text on every query with nothing persisted in between.
KHOAN_RE = re.compile(r"^(\d{1,2})\.\s+(?=\S)", re.MULTILINE)


@dataclass
class KhoanSegment:
    khoan_number: int
    text: str


def split_khoan(text: str) -> list[KhoanSegment]:
    # A match at position 0 is the article's own heading line, not khoản 1 —
    # normally "Điều N." doesn't match KHOAN_RE (starts with a word, not a
    # digit), but a handful of chunks had "Điều" manually stripped during
    # gap recovery and start with a bare "N. Title" that otherwise looks
    # identical to a real khoản heading.
    matches = [m for m in KHOAN_RE.finditer(text) if m.start() > 0]
    if len(matches) < 2:
        return []
    segments = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        segments.append(KhoanSegment(khoan_number=int(m.group(1)), text=text[start:end].strip()))
    return segments


def build_khoan_chunks(article_chunk: ArticleChunk) -> list[ArticleChunk]:
    """Materialize an article chunk's khoản segments as their own chunks,
    parented to it — pure structural decomposition (regex only, no LLM,
    no embedding), so this stays cheap to (re-)run as corpus content
    changes. Excluded from retrieval/embedding for now (see contextualize.py
    and load_vectorstore.py) until a later phase decides they're ready to be
    retrieved directly."""
    segments = split_khoan(article_chunk.text)
    return [
        article_chunk.model_copy(
            update={
                "chunk_id": f"{article_chunk.chunk_id}::khoan_{seg.khoan_number}",
                "text": seg.text,
                "chunk_type": "khoan",
                "khoan_number": seg.khoan_number,
                "parent_chunk_id": article_chunk.chunk_id,
                "embedding_text": None,
            }
        )
        for seg in segments
    ]


def load_corpus(path: Path) -> list[ArticleChunk]:
    return [
        ArticleChunk.model_validate_json(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def split_corpus_khoan(corpus_path: Path = CORPUS_PATH) -> None:
    """Post-process corpus.jsonl (run after build_corpus + recover_gaps, so
    khoản boundaries are computed from final, gap-corrected article text):
    drop any khoản chunks from a previous run, then regenerate them from the
    current article chunks and write the corpus back out with both."""
    chunks = load_corpus(corpus_path)
    base_chunks = [c for c in chunks if c.chunk_type != "khoan"]

    khoan_chunks: list[ArticleChunk] = []
    for chunk in base_chunks:
        if chunk.chunk_type == "article":
            khoan_chunks.extend(build_khoan_chunks(chunk))

    with corpus_path.open("w", encoding="utf-8") as f:
        for chunk in base_chunks + khoan_chunks:
            f.write(chunk.model_dump_json() + "\n")

    articles_with_khoan = len({c.parent_chunk_id for c in khoan_chunks})
    print(
        f"Split {articles_with_khoan} multi-khoản articles into "
        f"{len(khoan_chunks)} khoản chunks -> {corpus_path}"
    )


if __name__ == "__main__":
    split_corpus_khoan()
