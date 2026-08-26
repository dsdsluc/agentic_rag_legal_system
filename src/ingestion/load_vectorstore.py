from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

from .embed import embed_texts
from .models import ArticleChunk
from .vectorstore import get_collection, upsert_chunks

load_dotenv()

CORPUS_PATH = Path("data/processed/corpus.jsonl")
BATCH_SIZE = 32


# Cached: this file only changes when the ingestion pipeline re-runs (a
# separate offline process), but it's read on every /documents API request
# with no auth in front of it — re-parsing the whole JSONL per request is
# wasted I/O for data that's effectively static for the life of the server.
@lru_cache(maxsize=1)
def load_corpus(path: Path = CORPUS_PATH) -> list[ArticleChunk]:
    chunks = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                chunks.append(ArticleChunk.model_validate_json(line))
    return chunks


def load_vectorstore() -> None:
    # "khoan" chunks are structural sub-records materialized by
    # khoan_split.py (parented to their Điều) — not yet meant to be
    # retrieved directly, so they're kept out of Chroma entirely rather than
    # embedded and filtered at query time like "template" chunks are.
    chunks = [c for c in load_corpus() if c.chunk_type != "khoan"]
    if not chunks:
        print(f"No chunks found in {CORPUS_PATH} — run build_corpus first.")
        return

    collection = get_collection()
    for i in tqdm(range(0, len(chunks), BATCH_SIZE), desc="Embedding + loading"):
        batch = chunks[i : i + BATCH_SIZE]
        embeddings = embed_texts([c.embedding_text or c.text for c in batch])
        upsert_chunks(batch, embeddings, collection=collection)

    print(f"Loaded {len(chunks)} chunks into Chroma collection '{collection.name}'")


if __name__ == "__main__":
    load_vectorstore()
