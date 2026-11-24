"""Experiment (investigation/re-rank.txt): does a cross-encoder reranker on
top of the "+sub" hybrid retrieval (step 1) improve the top-5?

Like exp_khoan_chunks.py this runs in memory only — chroma_db/ and the
corpus are not modified. Requires that exp_khoan_chunks.py has run once
(it caches the sub-chunk vectors in tmp/exp_khoan/) and the reranker saved
in models/bge-reranker-v2-m3.

For each question:
  1. "+sub" hybrid retrieval (dense + BM25 over Điều + sub-chunks, RRF),
     de-duplicated to the top-N parent Điều (N = 20 / 30 / 50).
  2. The reranker scores (question, text) pairs, either
       unit=article : the Điều's own text (header + body, truncated to 512 tokens)
       unit=khoan   : the Điều text AND each of its sub-chunks; the Điều
                      gets the MAX score over them
  3. Final order either
       score=rerank : reranker score only
       score=blend  : RRF of (hybrid rank, reranker rank)

Usage (from project root):
    PYTHONPATH=src python scripts/experiments/exp_rerank.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from exp_khoan_chunks import (  # noqa: E402
    Index, build_subchunks, embed_cached, header_for, load_corpus,
)
from ingestion.index.embed import get_embedding_model  # noqa: E402
from ingestion.index.vectorstore import get_collection  # noqa: E402
from rag.evaluation.eval_retrieval import DATASET_PATH, score_case  # noqa: E402

RERANKER_DIR = ROOT / "models" / "bge-reranker-v2-m3"
RRF_K = 60
POOL_SIZES = (20, 30, 50)
METRICS = ["hit@1", "hit@3", "hit@5", "recall@5", "mrr"]


def summarize(rows):
    return {k: sum(r[k] for r in rows) / len(rows) for k in METRICS}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    import torch
    from sentence_transformers import CrossEncoder

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = get_embedding_model()
    tok = model.tokenizer
    n_tokens = lambda s: len(tok.tokenize(s))  # noqa: E731

    # --- rebuild the "+sub" index exactly as in exp_khoan_chunks.py
    corpus = load_corpus()
    by_id = {c["chunk_id"]: c for c in corpus}
    got = get_collection().get(include=["embeddings", "metadatas"])
    base = [(cid, np.asarray(e, dtype=np.float32)) for cid, e, m in
            zip(got["ids"], got["embeddings"], got["metadatas"]) if m.get("chunk_type") != "template"]
    base_ids = [c for c, _ in base]
    base_vecs = np.vstack([v for _, v in base])
    base_bm25 = [by_id[c].get("embedding_text") or by_id[c]["text"] for c in base_ids]
    subs, _long = build_subchunks(corpus, n_tokens)
    sub_vecs = embed_cached([s["text"] for s in subs], "subchunks")
    index = Index(base_ids + [s["id"] for s in subs], base_ids + [s["parent"] for s in subs],
                  np.vstack([base_vecs, sub_vecs]), base_bm25 + [s["text"] for s in subs])

    subs_by_parent: dict[str, list[str]] = {}
    for s in subs:
        subs_by_parent.setdefault(s["parent"], []).append(s["text"])

    def article_text(cid: str) -> str:
        c = by_id[cid]
        if c["chunk_type"] == "article":
            return f"{header_for(c)}\n{c['text']}"
        return c.get("embedding_text") or c["text"]

    cases = json.loads((ROOT / DATASET_PATH).read_text(encoding="utf-8"))
    qvecs = model.encode([c["question"] for c in cases], normalize_embeddings=True)
    max_pool = max(POOL_SIZES)
    pools = [index.hybrid(c["question"], qv, limit=max_pool) for c, qv in zip(cases, qvecs)]

    print(f"Tải reranker từ {RERANKER_DIR.name} lên {device} ...")
    reranker = CrossEncoder(str(RERANKER_DIR), max_length=512, device=device)

    # --- score every (question, text) pair once, cache, reuse across configs
    article_scores: list[dict[str, float]] = []
    khoan_scores: list[dict[str, float]] = []
    t0 = time.perf_counter()
    n_pairs = 0
    for case, pool in zip(cases, pools):
        q = case["question"]
        a_pairs = [(q, article_text(cid)) for cid in pool]
        a = reranker.predict(a_pairs, batch_size=32, show_progress_bar=False)
        article_scores.append(dict(zip(pool, map(float, a))))
        k_pairs, owners = [], []
        for cid in pool:
            for t in subs_by_parent.get(cid, []):
                k_pairs.append((q, t))
                owners.append(cid)
        best = dict(article_scores[-1])
        if k_pairs:
            ks = reranker.predict(k_pairs, batch_size=32, show_progress_bar=False)
            for cid, s in zip(owners, ks):
                best[cid] = max(best[cid], float(s))
        khoan_scores.append(best)
        n_pairs += len(a_pairs) + len(k_pairs)
    elapsed = time.perf_counter() - t0
    print(f"Đã chấm {n_pairs} cặp trong {elapsed:.1f}s "
          f"(~{elapsed / len(cases):.2f}s/câu với pool {max_pool}, cả 2 cách chấm)")

    # --- evaluate configurations
    results: dict[str, list[dict]] = {}

    def run(name, rank_fn):
        rows = []
        for i, case in enumerate(cases):
            ranked = rank_fn(i)
            rows.append({"id": case["id"], "question": case["question"], "style": case["style"],
                         "domain": case["domain"], "top5": ranked[:5],
                         **score_case(ranked, set(case["relevant"]))})
        results[name] = rows

    run("+sub (không rerank)", lambda i: pools[i][:20])
    for n in POOL_SIZES:
        for unit, table in (("article", article_scores), ("khoan", khoan_scores)):
            def rerank_only(i, n=n, table=table):
                pool = pools[i][:n]
                return sorted(pool, key=lambda c: table[i][c], reverse=True)

            def blend(i, n=n, table=table):
                pool = pools[i][:n]
                rr = {c: r for r, c in enumerate(sorted(pool, key=lambda c: table[i][c], reverse=True), 1)}
                fused = {c: 1 / (RRF_K + h) + 1 / (RRF_K + rr[c]) for h, c in enumerate(pool, 1)}
                return sorted(pool, key=fused.get, reverse=True)

            run(f"pool={n:<2} unit={unit:7} score=rerank", rerank_only)
            run(f"pool={n:<2} unit={unit:7} score=blend", blend)

    print(f"\n{'cấu hình':38}" + "".join(f"{k:>10}" for k in METRICS))
    for name, rows in results.items():
        s = summarize(rows)
        print(f"{name:38}" + "".join(f"{s[k]:>10.3f}" for k in METRICS))

    best_name = max((n for n in results if n.startswith("pool")),
                    key=lambda n: (summarize(results[n])["hit@5"], summarize(results[n])["mrr"]))
    print(f"\n--- Tốt nhất: {best_name}  — so với +sub (không rerank), hạng Điều đúng đầu tiên:")
    base_rows = results["+sub (không rerank)"]
    for b, n in zip(base_rows, results[best_name]):
        fb = "—" if b["mrr"] == 0 else int(b["first_rank"])
        fn = "—" if n["mrr"] == 0 else int(n["first_rank"])
        if fb != fn:
            tag = "tốt hơn" if n["mrr"] > b["mrr"] else "TỆ HƠN"
            print(f"  [{b['id']}] {fb:>2} -> {fn:>2}  {tag:8} {b['question']}")
    for grp in ("style", "domain"):
        for val in sorted({r[grp] for r in base_rows}):
            rb = [r for r in base_rows if r[grp] == val]
            rn = [r for r in results[best_name] if r[grp] == val]
            print(f"  {grp}={val:11} hit@5 {summarize(rb)['hit@5']:.3f} -> {summarize(rn)['hit@5']:.3f}"
                  f"   mrr {summarize(rb)['mrr']:.3f} -> {summarize(rn)['mrr']:.3f}")
    misses = [r for r in results[best_name] if r["hit@5"] == 0]
    print(f"\n  Còn trượt top 5 ({len(misses)}):")
    for r in misses:
        rank = "ngoài pool" if r["mrr"] == 0 else f"hạng {int(r['first_rank'])}"
        print(f"   - [{r['id']}] {r['question']} -> {rank}")

    # --- score distribution (input for a future "không tìm thấy" threshold)
    unit_table = khoan_scores if "khoan" in best_name else article_scores
    hit_top, miss_top = [], []
    for i, r in enumerate(results[best_name]):
        top = max(unit_table[i].values())
        (hit_top if r["hit@5"] else miss_top).append(top)
    pct = lambda xs, p: float(np.percentile(xs, p)) if xs else float("nan")  # noqa: E731
    print(f"\n  Điểm reranker cao nhất mỗi câu — câu tìm đúng: min {min(hit_top):.3f}, "
          f"p10 {pct(hit_top, 10):.3f}, median {pct(hit_top, 50):.3f}"
          + (f" | câu trượt: median {pct(miss_top, 50):.3f}" if miss_top else ""))

    out = ROOT / "data/eval/results/exp_rerank.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nĐã lưu: {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
