from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

from ingestion.index.embed import embed_texts
from ingestion.models import ArticleChunk
from ingestion.index.vectorstore import get_collection, upsert_chunks

load_dotenv()

CORPUS_PATH = Path("data/processed/corpus.jsonl")
BATCH_SIZE = 64


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
    """(Re)build the Chroma collection from scratch: every corpus chunk
    except the structural "khoan" records, PLUS the "subchunk" retrieval
    units of long Điều (retrieval_units.py). Rebuilt rather than upserted
    because a change to how text is embedded (e.g. word segmentation) makes
    every old vector incompatible, and stale unit ids must not linger."""
    from ingestion.index.retrieval_units import get_retrieval_units
    from ingestion.index.vectorstore import COLLECTION_NAME, get_client

    base = [c for c in load_corpus() if c.chunk_type != "khoan"]
    if not base:
        print(f"No chunks found in {CORPUS_PATH} — run build_corpus first.")
        return
    units = list(get_retrieval_units())
    chunks = base + units

    client = get_client()
    if COLLECTION_NAME in [c.name if hasattr(c, "name") else c for c in client.list_collections()]:
        client.delete_collection(COLLECTION_NAME)
    collection = get_collection(client)
    for i in tqdm(range(0, len(chunks), BATCH_SIZE), desc="Embedding + loading"):
        batch = chunks[i : i + BATCH_SIZE]
        embeddings = embed_texts([c.embedding_text or c.text for c in batch], batch_size=BATCH_SIZE)
        upsert_chunks(batch, embeddings, collection=collection)

    print(f"Loaded {len(base)} chunks + {len(units)} sub-units = {len(chunks)} into "
          f"Chroma collection '{collection.name}'")


if __name__ == "__main__":
    load_vectorstore()
