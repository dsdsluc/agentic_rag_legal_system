from __future__ import annotations

from pathlib import Path

from .models import ArticleChunk

CHROMA_DIR = Path("chroma_db")
COLLECTION_NAME = "legal_corpus"


def get_client():
    import chromadb

    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=str(CHROMA_DIR))


def get_collection(client=None):
    client = client or get_client()
    return client.get_or_create_collection(name=COLLECTION_NAME)


def chunk_metadata(chunk: ArticleChunk) -> dict:
    return {
        "doc_id": chunk.doc_id,
        "doc_type": chunk.doc_type.value,
        "domain": chunk.domain.value,
        "doc_title": chunk.doc_title,
        "article_number": chunk.article_number if chunk.article_number is not None else -1,
        "article_heading": chunk.article_heading or "",
        "chunk_type": chunk.chunk_type,
        "needs_review": chunk.needs_review,
        "source_file": chunk.source_file,
    }


def upsert_chunks(chunks: list[ArticleChunk], embeddings: list[list[float]], collection=None) -> None:
    collection = collection or get_collection()
    collection.upsert(
        ids=[c.chunk_id for c in chunks],
        embeddings=embeddings,
        documents=[c.text for c in chunks],
        metadatas=[chunk_metadata(c) for c in chunks],
    )
