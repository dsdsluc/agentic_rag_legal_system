"""Download the models the backend loads from models/.

Run once per machine (from the project root):

    python scripts/download_models.py

  - embedding: bkai-foundation-models/vietnamese-bi-encoder (~500 MB)
  - reranker:  BAAI/bge-reranker-v2-m3 (~2.2 GB; optional — retrieval
               falls back to no reranking if it's missing)

The backend loads both by path and never contacts huggingface.co at startup.
models/ is gitignored.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

# The newer "xet" download backend stalled mid-file on this project's
# reranker download (twice); plain HTTP was reliable.
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

from ingestion.index.embed import EMBEDDING_MODEL_DIR, EMBEDDING_MODEL_NAME  # noqa: E402
from rag.retrieval.rerank import RERANKER_DIR, RERANKER_MODEL_NAME  # noqa: E402


def main() -> None:
    from sentence_transformers import CrossEncoder, SentenceTransformer

    if (EMBEDDING_MODEL_DIR / "modules.json").exists():
        print(f"Already present: {EMBEDDING_MODEL_DIR}")
    else:
        print(f"Downloading {EMBEDDING_MODEL_NAME} -> {EMBEDDING_MODEL_DIR}")
        SentenceTransformer(EMBEDDING_MODEL_NAME).save(str(EMBEDDING_MODEL_DIR))

    if (RERANKER_DIR / "config.json").exists():
        print(f"Already present: {RERANKER_DIR}")
    else:
        print(f"Downloading {RERANKER_MODEL_NAME} -> {RERANKER_DIR}")
        CrossEncoder(RERANKER_MODEL_NAME).save(str(RERANKER_DIR))
    print("Done.")


if __name__ == "__main__":
    main()
