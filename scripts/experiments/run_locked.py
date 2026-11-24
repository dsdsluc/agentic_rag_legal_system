"""Run the LOCKED retrieval configuration (investigation/result.txt) on any
question set and write a review file for the misses.

Locked config: Điều + khoản sub-chunks; bkai embedding on pyvi-segmented
text (query too); BM25 on original text; hybrid RRF -> 20 Điều; rerank with
bge-reranker-v2-m3 (FP16, 256 tokens, 5 khoản/Điều, original text) -> top 5.

Reuses the vectors cached by exp_wordseg.py (tmp/exp_wordseg/), so nothing is
re-embedded. chroma_db/ is not touched.

Usage (from project root):
    PYTHONPATH=src python -u scripts/experiments/run_locked.py data/eval/retrieval_set_candidates.json
Writes:
    data/eval/results/locked_<dataset-name>.json   (per-question results)
    investigation/review_<dataset-name>.md         (misses, for human review)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from exp_khoan_chunks import Index, build_subchunks, header_for, load_corpus  # noqa: E402
from ingestion.index.embed import get_embedding_model  # noqa: E402
from ingestion.index.vectorstore import get_collection  # noqa: E402
from rag.evaluation.eval_retrieval import score_case  # noqa: E402

CACHE = ROOT / "tmp/exp_wordseg"
RERANKER_DIR = ROOT / "models" / "bge-reranker-v2-m3"
POOL, K_PER_ARTICLE, RERANK_MAXLEN = 20, 5, 256


def main(dataset: Path) -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    import torch
    from pyvi import ViTokenizer
    from sentence_transformers import CrossEncoder

    model = get_embedding_model()
    n_tokens = lambda s: len(model.tokenizer.tokenize(s))  # noqa: E731
    corpus = load_corpus()
    by_id = {c["chunk_id"]: c for c in corpus}
    meta = get_collection().get(include=["metadatas"])
    base_ids = [cid for cid, m in zip(meta["ids"], meta["metadatas"]) if m.get("chunk_type") != "template"]
    subs, _ = build_subchunks(corpus, n_tokens)
    raw_texts = [by_id[c].get("embedding_text") or by_id[c]["text"] for c in base_ids] + [s["text"] for s in subs]
    seg_vecs = np.load(CACHE / "seg_vecs.npy")
    assert len(seg_vecs) == len(raw_texts), "tmp/exp_wordseg cache out of date — re-run exp_wordseg.py"
    index = Index(base_ids + [s["id"] for s in subs], base_ids + [s["parent"] for s in subs], seg_vecs, raw_texts)

    subs_by_parent: dict[str, list[int]] = {}
    for i, s in enumerate(subs):
        subs_by_parent.setdefault(s["parent"], []).append(len(base_ids) + i)

    def own_text(cid: str) -> str:
        c = by_id[cid]
        return f"{header_for(c)}\n{c['text']}" if c["chunk_type"] == "article" else (c.get("embedding_text") or c["text"])

    device = "cuda" if torch.cuda.is_available() else "cpu"
    reranker = CrossEncoder(str(RERANKER_DIR), max_length=RERANK_MAXLEN, device=device)
    if device == "cuda":
        reranker.model.half()

    cases = json.loads(dataset.read_text(encoding="utf-8"))
    qvecs = model.encode([ViTokenizer.tokenize(c["question"]) for c in cases], normalize_embeddings=True)
    rows = []
    for n, (case, qv) in enumerate(zip(cases, qvecs), 1):
        pool = index.hybrid(case["question"], qv, limit=POOL)
        pairs, owners, texts = [], [], []
        for cid in pool:
            idxs = subs_by_parent.get(cid) or []
            chosen = sorted(idxs, key=lambda j: -float(seg_vecs[j] @ qv))[:K_PER_ARTICLE]
            for t in ([raw_texts[j] for j in chosen] if chosen else [own_text(cid)]):
                pairs.append((case["question"], t))
                owners.append(cid)
                texts.append(t)
        scores = reranker.predict(pairs, batch_size=64, show_progress_bar=False)
        best: dict[str, tuple[float, str]] = {}
        for cid, s, t in zip(owners, scores, texts):
            if cid not in best or s > best[cid][0]:
                best[cid] = (float(s), t)
        ranked = sorted(best, key=lambda c: best[c][0], reverse=True)
        rows.append({**case, **score_case(ranked, set(case["relevant"])),
                     "top3": [{"chunk_id": c, "score": round(best[c][0], 3), "excerpt": best[c][1][:350]}
                              for c in ranked[:3]]})
        if n % 25 == 0:
            print(f"  {n}/{len(cases)}", flush=True)

    keys = ["hit@1", "hit@5", "mrr"]
    print("TỔNG " + "  ".join(f"{k} {sum(r[k] for r in rows) / len(rows):.3f}" for k in keys))
    for grp in ("style", "domain"):
        for val in sorted({r.get(grp, "") for r in rows}):
            rs = [r for r in rows if r.get(grp, "") == val]
            print(f"  {grp}={val:11} (n={len(rs):3})  " + "  ".join(f"{k} {sum(r[k] for r in rs) / len(rs):.3f}" for k in keys))

    name = dataset.stem
    (ROOT / f"data/eval/results/locked_{name}.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

    misses = [r for r in rows if r["hit@5"] == 0] + [r for r in rows if r["hit@5"] == 1 and r["hit@1"] == 0]
    lines = [f"# Duyệt câu hệ thống trả lời sai — {dataset.name}", "",
             "Mỗi mục: câu hỏi, đáp án đang ghi, và 3 Điều hệ thống xếp đầu.",
             "Hãy đánh dấu một trong: **GIỮ** (đáp án đúng, hệ thống sai) / **THÊM ĐÁP ÁN** (Điều hệ thống tìm",
             "cũng đúng -> ghi chunk_id) / **SỬA CÂU** / **BỎ** (câu mơ hồ, không giống câu người dân hỏi).", ""]
    for title, group in (("## A. Trượt top 5", [r for r in misses if r["hit@5"] == 0]),
                         ("## B. Trong top 5 nhưng không đứng đầu", [r for r in misses if r["hit@5"] == 1])):
        lines += [title, ""]
        for r in group:
            rank = "ngoài top 20" if r["mrr"] == 0 else f"hạng {int(r['first_rank'])}"
            lines += [f"### [{r['id']}] {r['question']}",
                      f"- Kiểu: {r.get('style')} · Đáp án đang ghi: `{', '.join(r['relevant'])}` ({rank})",
                      f"- Nguồn: {r.get('source_heading', '')}", "- Hệ thống xếp đầu:"]
            for i, t in enumerate(r["top3"], 1):
                ok = " ✅" if t["chunk_id"] in r["relevant"] else ""
                excerpt = t["excerpt"].replace("\n", " ")
                lines.append(f"  {i}. `{t['chunk_id']}` (điểm {t['score']}){ok} — {excerpt}")
            lines += ["- Quyết định: ", ""]
    out = ROOT / f"investigation/review_{name}.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nTrượt top 5: {sum(r['hit@5'] == 0 for r in rows)}, trong top 5 nhưng không hạng 1: "
          f"{sum(r['hit@5'] == 1 and r['hit@1'] == 0 for r in rows)} -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data/eval/retrieval_set_candidates.json")
