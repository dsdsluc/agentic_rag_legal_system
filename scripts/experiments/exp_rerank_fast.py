"""Experiment: make the reranker cheap enough for production while keeping
the accuracy found in exp_rerank.py (pool=20, unit=khoan, score=rerank:
Hit@5 ~91%, MRR ~0.82).

Levers:
  - FP16 weights on GPU
  - max K sub-chunks per long Điều, picked by the embedding similarity the
    retriever already computed (no extra cost) — instead of all of them
  - reranker max_length 256 vs 512 (sub-chunks are ~150 tokens)

Short Điều (no sub-chunks) are scored on their own text. Timing is measured
per question around the reranker call only (CUDA synchronized), after a
warm-up, so it is the latency rerank would add to one chat request.

Usage (from project root):
    PYTHONPATH=src python scripts/experiments/exp_rerank_fast.py
"""
from __future__ import annotations

import json
import statistics
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from exp_khoan_chunks import Index, build_subchunks, embed_cached, header_for, load_corpus  # noqa: E402
from ingestion.index.embed import get_embedding_model  # noqa: E402
from ingestion.index.vectorstore import get_collection  # noqa: E402
from rag.evaluation.eval_retrieval import DATASET_PATH, score_case  # noqa: E402

RERANKER_DIR = ROOT / "models" / "bge-reranker-v2-m3"
POOL = 20
K_OPTIONS = (2, 3, 5)             # "all sub-chunks" is already measured in exp_rerank.py
MAXLEN_OPTIONS = (256, 512)
METRICS = ["hit@1", "hit@5", "mrr"]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    import torch
    from sentence_transformers import CrossEncoder

    model = get_embedding_model()
    tok = model.tokenizer
    n_tokens = lambda s: len(tok.tokenize(s))  # noqa: E731

    corpus = load_corpus()
    by_id = {c["chunk_id"]: c for c in corpus}
    got = get_collection().get(include=["embeddings", "metadatas"])
    base = [(cid, np.asarray(e, dtype=np.float32)) for cid, e, m in
            zip(got["ids"], got["embeddings"], got["metadatas"]) if m.get("chunk_type") != "template"]
    base_ids = [c for c, _ in base]
    base_vecs = np.vstack([v for _, v in base])
    base_bm25 = [by_id[c].get("embedding_text") or by_id[c]["text"] for c in base_ids]
    subs, _ = build_subchunks(corpus, n_tokens)
    sub_vecs = embed_cached([s["text"] for s in subs], "subchunks")
    index = Index(base_ids + [s["id"] for s in subs], base_ids + [s["parent"] for s in subs],
                  np.vstack([base_vecs, sub_vecs]), base_bm25 + [s["text"] for s in subs])

    subs_by_parent: dict[str, list[int]] = {}
    for i, s in enumerate(subs):
        subs_by_parent.setdefault(s["parent"], []).append(i)

    def own_text(cid: str) -> str:
        c = by_id[cid]
        return f"{header_for(c)}\n{c['text']}" if c["chunk_type"] == "article" else (c.get("embedding_text") or c["text"])

    cases = json.loads((ROOT / DATASET_PATH).read_text(encoding="utf-8"))
    qvecs = model.encode([c["question"] for c in cases], normalize_embeddings=True)
    pools = [index.hybrid(c["question"], qv, limit=POOL) for c, qv in zip(cases, qvecs)]

    def pairs_for(i: int, k):
        q, qv = cases[i]["question"], qvecs[i]
        texts, owners = [], []
        for cid in pools[i]:
            sub_idx = subs_by_parent.get(cid)
            if not sub_idx:
                texts.append(own_text(cid))
                owners.append(cid)
                continue
            chosen = sub_idx if k is None else sorted(sub_idx, key=lambda j: -float(sub_vecs[j] @ qv))[:k]
            for j in chosen:
                texts.append(subs[j]["text"])
                owners.append(cid)
        return [(q, t) for t in texts], owners

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Thiết bị: {device}, pool={POOL}, FP16")
    reranker = CrossEncoder(str(RERANKER_DIR), max_length=512, device=device)
    if device == "cuda":
        reranker.model.half()
    reranker.predict([("khởi động", "làm nóng GPU")] * 64, batch_size=64, show_progress_bar=False)

    def sync():
        if device == "cuda":
            torch.cuda.synchronize()

    print(f"\n{'Khoản/Điều':>10} {'max_len':>8} {'cặp/câu':>8} {'s/câu':>7} {'p90 s':>7}" + "".join(f"{m:>8}" for m in METRICS))
    summary = []
    for k in K_OPTIONS:
        for max_len in MAXLEN_OPTIONS:
            reranker.max_length = max_len
            if hasattr(reranker, "tokenizer"):
                reranker.tokenizer.model_max_length = max_len
            rows, times, npairs = [], [], []
            for i, case in enumerate(cases):
                pairs, owners = pairs_for(i, k)
                sync()
                t0 = time.perf_counter()
                scores = reranker.predict(pairs, batch_size=64, show_progress_bar=False)
                sync()
                times.append(time.perf_counter() - t0)
                npairs.append(len(pairs))
                best: dict[str, float] = {}
                for cid, s in zip(owners, scores):
                    best[cid] = max(best.get(cid, -1e9), float(s))
                ranked = sorted(best, key=best.get, reverse=True)
                rows.append(score_case(ranked, set(case["relevant"])))
            m = {k_: sum(r[k_] for r in rows) / len(rows) for k_ in METRICS}
            label = "tất cả" if k is None else str(k)
            p90 = float(np.percentile(times, 90))
            print(f"{label:>10} {max_len:>8} {statistics.mean(npairs):>8.0f} {statistics.mean(times):>7.2f} {p90:>7.2f}"
                  + "".join(f"{m[x]:>8.3f}" for x in METRICS), flush=True)
            summary.append({"k": label, "max_len": max_len, "pairs": statistics.mean(npairs),
                            "sec_mean": statistics.mean(times), "sec_p90": p90, **m})

    out = ROOT / "data/eval/results/exp_rerank_fast.json"
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nMốc so sánh (exp_rerank, FP32, tất cả Khoản, 512): Hit@1 0.743, Hit@5 0.914, MRR 0.818")
    print(f"Đã lưu: {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
