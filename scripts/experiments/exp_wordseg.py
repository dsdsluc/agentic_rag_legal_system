"""Experiment (step B, option 1): bkai embedding + Vietnamese word
segmentation (pyvi), on top of the locked configuration
(Điều + khoản sub-chunks -> hybrid pool 20 -> rerank FP16, 5 khoản/Điều, 256).

bkai-foundation-models/vietnamese-bi-encoder is PhoBERT-based and was trained
on word-segmented text ("điều_khiển", "mô_tô"); production feeds it raw text.

Variants (everything else identical):
  raw        : unsegmented embedding + unsegmented BM25 (= locked config)
  seg-dense  : segmented text for the embedding only
  seg-all    : segmented text for the embedding AND BM25

The reranker always sees the ORIGINAL text (it's a multilingual model that
was not trained on underscores). Runs in memory + tmp/ only; chroma_db/ is
not modified (all units are re-embedded here, cached in tmp/exp_wordseg/).

Usage (from project root):
    PYTHONPATH=src python -u scripts/experiments/exp_wordseg.py
"""
from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from exp_khoan_chunks import Index, build_subchunks, header_for, load_corpus  # noqa: E402
from ingestion.index.embed import get_embedding_model  # noqa: E402
from ingestion.index.vectorstore import get_collection  # noqa: E402
from rag.evaluation.eval_retrieval import DATASET_PATH, score_case  # noqa: E402

CACHE = ROOT / "tmp/exp_wordseg"
RERANKER_DIR = ROOT / "models" / "bge-reranker-v2-m3"
POOL, K_PER_ARTICLE, RERANK_MAXLEN, MAX_TOKENS = 20, 5, 256, 254
RET_METRICS = ["hit@5", "recall@10", "recall@20", "mrr"]
FULL_METRICS = ["hit@1", "hit@5", "mrr"]


def segment(text: str) -> str:
    from pyvi import ViTokenizer
    return ViTokenizer.tokenize(text)


def cached(name: str, build):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name}.npy"
    if path.exists():
        return np.load(path)
    arr = build()
    np.save(path, arr)
    return arr


def mean_metrics(rows, keys):
    return {k: sum(r[k] for r in rows) / len(rows) for k in keys}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    import torch
    from sentence_transformers import CrossEncoder

    model = get_embedding_model()
    tok = model.tokenizer
    n_tokens = lambda s: len(tok.tokenize(s))  # noqa: E731
    enc = lambda texts: model.encode(texts, batch_size=64, show_progress_bar=True,  # noqa: E731
                                     normalize_embeddings=True)

    corpus = load_corpus()
    by_id = {c["chunk_id"]: c for c in corpus}
    meta = get_collection().get(include=["metadatas"])
    base_ids = [cid for cid, m in zip(meta["ids"], meta["metadatas"]) if m.get("chunk_type") != "template"]
    base_texts = [by_id[c].get("embedding_text") or by_id[c]["text"] for c in base_ids]
    subs, _ = build_subchunks(corpus, n_tokens)  # same sub-chunk boundaries as the locked config
    sub_texts = [s["text"] for s in subs]
    all_ids = base_ids + [s["id"] for s in subs]
    all_parents = base_ids + [s["parent"] for s in subs]
    raw_texts = base_texts + sub_texts

    print(f"Đơn vị: {len(base_ids)} Điều/phụ lục + {len(subs)} đoạn Khoản = {len(raw_texts)}", flush=True)
    print("Tách từ toàn bộ văn bản (pyvi, CPU)...", flush=True)
    seg_path = CACHE / "seg_texts.json"
    if seg_path.exists():
        seg_texts = json.loads(seg_path.read_text(encoding="utf-8"))
    else:
        CACHE.mkdir(parents=True, exist_ok=True)
        seg_texts = [segment(t) for t in raw_texts]
        seg_path.write_text(json.dumps(seg_texts, ensure_ascii=False), encoding="utf-8")

    over_raw = sum(n_tokens(t) > MAX_TOKENS for t in raw_texts)
    over_seg = sum(n_tokens(t) > MAX_TOKENS for t in seg_texts)
    print(f"Đơn vị dài hơn 256 token: không tách {over_raw}, có tách {over_seg}", flush=True)

    print("Embedding (GPU)...", flush=True)
    raw_vecs = cached("raw_vecs", lambda: enc(raw_texts))
    seg_vecs = cached("seg_vecs", lambda: enc(seg_texts))

    cases = json.loads((ROOT / DATASET_PATH).read_text(encoding="utf-8"))
    questions = [c["question"] for c in cases]
    q_raw = model.encode(questions, normalize_embeddings=True)
    q_seg = model.encode([segment(q) for q in questions], normalize_embeddings=True)

    variants = {
        "raw": (Index(all_ids, all_parents, raw_vecs, raw_texts), q_raw, raw_vecs, False),
        "seg-dense": (Index(all_ids, all_parents, seg_vecs, raw_texts), q_seg, seg_vecs, False),
        "seg-all": (Index(all_ids, all_parents, seg_vecs, seg_texts), q_seg, seg_vecs, True),
    }

    device = "cuda" if torch.cuda.is_available() else "cpu"
    reranker = CrossEncoder(str(RERANKER_DIR), max_length=RERANK_MAXLEN, device=device)
    if device == "cuda":
        reranker.model.half()

    subs_by_parent: dict[str, list[int]] = {}
    for i, s in enumerate(subs):
        subs_by_parent.setdefault(s["parent"], []).append(len(base_ids) + i)

    def own_text(cid: str) -> str:
        c = by_id[cid]
        return f"{header_for(c)}\n{c['text']}" if c["chunk_type"] == "article" else (c.get("embedding_text") or c["text"])

    print(f"\n{'biến thể':10} | tìm (hybrid):" + "".join(f"{m:>10}" for m in RET_METRICS)
          + " | sau rerank:" + "".join(f"{m:>8}" for m in FULL_METRICS), flush=True)
    report = {}
    for name, (index, qvecs, vecs, seg_bm25) in variants.items():
        ret_rows, full_rows = [], []
        for case, qv in zip(cases, qvecs):
            q_bm25 = segment(case["question"]) if seg_bm25 else case["question"]
            pool = index.hybrid(q_bm25, qv, limit=POOL)
            gold = set(case["relevant"])
            ret_rows.append({"id": case["id"], **score_case(pool, gold)})

            pairs, owners = [], []
            for cid in pool:
                idxs = subs_by_parent.get(cid)
                if not idxs:
                    pairs.append((case["question"], own_text(cid)))
                    owners.append(cid)
                    continue
                for j in sorted(idxs, key=lambda j: -float(vecs[j] @ qv))[:K_PER_ARTICLE]:
                    pairs.append((case["question"], raw_texts[j]))  # reranker reads original text
                    owners.append(cid)
            scores = reranker.predict(pairs, batch_size=64, show_progress_bar=False)
            best: dict[str, float] = {}
            for cid, s in zip(owners, scores):
                best[cid] = max(best.get(cid, -1e9), float(s))
            ranked = sorted(best, key=best.get, reverse=True)
            full_rows.append({"id": case["id"], "question": case["question"], **score_case(ranked, gold)})

        r, f = mean_metrics(ret_rows, RET_METRICS), mean_metrics(full_rows, FULL_METRICS)
        print(f"{name:10} | {'':13}" + "".join(f"{r[m]:>10.3f}" for m in RET_METRICS)
              + " | " + " " * 11 + "".join(f"{f[m]:>8.3f}" for m in FULL_METRICS), flush=True)
        report[name] = {"retrieval": ret_rows, "full": full_rows}

    for name in ("seg-dense", "seg-all"):
        print(f"\n--- {name} so với raw (sau rerank, hạng Điều đúng đầu tiên):")
        for b, n in zip(report["raw"]["full"], report[name]["full"]):
            fb = "—" if b["mrr"] == 0 else int(b["first_rank"])
            fn = "—" if n["mrr"] == 0 else int(n["first_rank"])
            if fb != fn:
                tag = "tốt hơn" if n["mrr"] > b["mrr"] else "TỆ HƠN"
                print(f"  [{b['id']}] {fb:>2} -> {fn:>2}  {tag:8} {b['question']}")
        lost = [b for b, n in zip(report["raw"]["retrieval"], report[name]["retrieval"])
                if b["recall@20"] > 0 and n["recall@20"] == 0]
        found = [n for b, n in zip(report["raw"]["retrieval"], report[name]["retrieval"])
                 if b["recall@20"] == 0 and n["recall@20"] > 0]
        print(f"  Bước tìm: bắt thêm được {len(found)} câu ngoài pool {[x['id'] for x in found]}, "
              f"đánh rơi {len(lost)} câu {[x['id'] for x in lost]}")

    out = ROOT / "data/eval/results/exp_wordseg.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nĐã lưu: {out.relative_to(ROOT)}", flush=True)


if __name__ == "__main__":
    main()
