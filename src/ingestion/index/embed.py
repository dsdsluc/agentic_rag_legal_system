from __future__ import annotations

from functools import lru_cache
from pathlib import Path

# Hugging Face repo the weights come from — used only by
# scripts/download_models.py to (re)create the local copy below.
EMBEDDING_MODEL_NAME = "bkai-foundation-models/vietnamese-bi-encoder"

# Loaded from a project-local directory rather than by repo id, so startup
# makes no network calls to huggingface.co (no version checks, works offline)
# and the model can't change underneath us if the upstream repo is updated.
EMBEDDING_MODEL_DIR = Path(__file__).resolve().parents[3] / "models" / "vietnamese-bi-encoder"


@lru_cache(maxsize=1)
def get_embedding_model():
    from sentence_transformers import SentenceTransformer

    if not (EMBEDDING_MODEL_DIR / "modules.json").exists():
        raise FileNotFoundError(
            f"Embedding model not found at {EMBEDDING_MODEL_DIR}. "
            "Run `python scripts/download_models.py` from the project root first."
        )
    # Use the GPU when this machine has a CUDA build of torch and a card
    # (big win for bulk re-embedding the corpus); servers with CPU-only
    # torch fall back transparently.
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    return SentenceTransformer(str(EMBEDDING_MODEL_DIR), device=device)


def segment_words(text: str) -> str:
    """Vietnamese word segmentation ("điều khiển xe mô tô" -> "điều_khiển xe
    mô_tô"). The bkai model is PhoBERT-based and was trained on segmented
    text — its vocabulary has entries like "điều_khiển" — so raw text is out
    of distribution for it. Measured on the retrieval eval set: Hit@5
    90% -> 96% (investigation/embedding_process/result.txt).

    Applied INSIDE embed_texts so documents and queries can never be
    embedded inconsistently. Only for the embedding — BM25 and the reranker
    keep reading the original text (segmenting BM25 measured worse)."""
    from pyvi import ViTokenizer

    return ViTokenizer.tokenize(text)


def embed_texts(texts: list[str], batch_size: int = 32) -> list[list[float]]:
    model = get_embedding_model()
    segmented = [segment_words(t) for t in texts]
    embeddings = model.encode(segmented, batch_size=batch_size, show_progress_bar=False, normalize_embeddings=True)
    return embeddings.tolist()
