"""Experiment (step 1 in investigation/result.txt): does indexing long Điều
split into khoản / điểm-group sub-chunks improve retrieval?

Runs entirely in memory + tmp/ — the real chroma_db/ and corpus are NOT
modified. Article vectors are read back from the existing Chroma collection
(so the baseline is byte-identical to production); only the new sub-chunks
are embedded, and cached to tmp/exp_khoan/ so re-runs are instant.

Every sub-chunk hit is mapped back to its parent Điều and de-duplicated
(best rank wins), so the scores are directly comparable to the baseline in
data/eval/results/ (same gold labels, same Hit@k / Recall@k / MRR).

Variants:
  baseline   : article chunks only (what production indexes today)
  +sub       : article chunks + sub-chunks of every long article
  sub-only   : long articles replaced by their sub-chunks (short ones kept)

Usage (from project root):
    PYTHONPATH=src python scripts/experiments/exp_khoan_chunks.py
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from ingestion.index.embed import get_embedding_model  # noqa: E402
from ingestion.chunking.khoan_split import split_khoan  # noqa: E402
from ingestion.index.vectorstore import get_collection  # noqa: E402
from rag.retrieval.bm25_index import tokenize  # noqa: E402
from rag.evaluation.eval_retrieval import DATASET_PATH, KS, score_case  # noqa: E402
from rank_bm25 import BM25Okapi  # noqa: E402

CORPUS = ROOT / "data/processed/corpus.jsonl"
CACHE = ROOT / "tmp/exp_khoan"
MAX_TOKENS = 254          # model limit is 256 incl. special tokens
PIECE_TOKENS = 200        # target size for điểm-group / window pieces
HEADER_MAX_CHARS = 160
CANDIDATES = 20           # same as FUSION_CANDIDATE_K in retriever.py
RRF_K = 60
DIEM_RE = re.compile(r"(?m)^\s*([a-zđ])\)\s+")


def load_corpus() -> list[dict]:
    return [json.loads(line) for line in CORPUS.read_text(encoding="utf-8").splitlines() if line.strip()]


def header_for(article: dict) -> str:
    heading = (article.get("article_heading") or "").strip()
    head = f"{article['doc_title']}, Điều {article['article_number']}. {heading}"
    return head[:HEADER_MAX_CHARS]


def split_long(text: str, n_tokens, budget: int) -> list[str]:
    """Split a khoản that is still too long: by điểm a), b)... grouped up to
    `budget` tokens, each group prefixed with the khoản's lead sentence (it
    carries the fine bracket). Falls back to word windows if no điểm."""
    marks = list(DIEM_RE.finditer(text))
    if len(marks) >= 2:
        lead = text[: marks[0].start()].strip()
        lead_short = " ".join(lead.split()[:60])
        diems = [text[m.start(): (marks[i + 1].start() if i + 1 < len(marks) else len(text))].strip()
                 for i, m in enumerate(marks)]
        pieces, cur = [], []
        for d in diems:
            candidate = "\n".join([lead_short, *cur, d])
            if cur and n_tokens(candidate) > budget:
                pieces.append("\n".join([lead_short, *cur]))
                cur = [d]
            else:
                cur.append(d)
        if cur:
            pieces.append("\n".join([lead_short, *cur]))
        return pieces
    words = text.split()
    step, size = 110, 150  # ~150 words per window, ~40 word overlap
    return [" ".join(words[i:i + size]) for i in range(0, max(1, len(words) - 40), step)]


def build_subchunks(corpus: list[dict], n_tokens) -> tuple[list[dict], set[str]]:
    existing_khoan: dict[str, list[dict]] = {}
    for c in corpus:
        if c["chunk_type"] == "khoan":
            existing_khoan.setdefault(c["parent_chunk_id"], []).append(c)

    subs, long_ids = [], set()
    for a in corpus:
        if a["chunk_type"] != "article":
            continue
        if n_tokens(a.get("embedding_text") or a["text"]) <= MAX_TOKENS:
            continue
        long_ids.add(a["chunk_id"])
        header = header_for(a)
        if a["chunk_id"] in existing_khoan:
            khoans = [k["text"] for k in existing_khoan[a["chunk_id"]]]
        else:
            khoans = [s.text for s in split_khoan(a["text"])] or [a["text"]]
        body_budget = PIECE_TOKENS - n_tokens(header)
        for ki, ktext in enumerate(khoans):
            pieces = [ktext] if n_tokens(ktext) <= body_budget else split_long(ktext, n_tokens, body_budget)
            for pi, piece in enumerate(pieces):
                subs.append({
                    "id": f"{a['chunk_id']}::sub_{ki}_{pi}",
                    "parent": a["chunk_id"],
                    "text": f"{header}\n{piece}",
                })
    return subs, long_ids


def embed_cached(texts: list[str], name: str) -> np.ndarray:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name}.npy"
    key = CACHE / f"{name}.count"
    if path.exists() and key.exists() and key.read_text() == str(len(texts)):
        return np.load(path)
    model = get_embedding_model()
    vecs = model.encode(texts, batch_size=32, show_progress_bar=True, normalize_embeddings=True)
    np.save(path, vecs)
    key.write_text(str(len(texts)))
    return vecs


class Index:
    def __init__(self, ids, parents, vecs, bm25_texts):
        self.ids, self.parents, self.vecs = ids, parents, vecs
        self.bm25 = BM25Okapi([tokenize(t) for t in bm25_texts])

    @staticmethod
    def _dedupe_parents(order, parents, limit):
        seen, out = set(), []
        for i in order:
            p = parents[i]
            if p not in seen:
                seen.add(p)
                out.append(p)
                if len(out) >= limit:
                    break
        return out

    def dense(self, qvec, limit=CANDIDATES):
        order = np.argsort(-(self.vecs @ qvec))[: limit * 15]
        return self._dedupe_parents(order, self.parents, limit)

    def bm25_rank(self, question, limit=CANDIDATES):
        scores = self.bm25.get_scores(tokenize(question))
        order = [i for i in np.argsort(-scores)[: limit * 15] if scores[i] > 0]
        return self._dedupe_parents(order, self.parents, limit)

    def hybrid(self, question, qvec, limit=CANDIDATES):
        rrf: dict[str, float] = {}
        for ranked in (self.dense(qvec), self.bm25_rank(question)):
            for r, pid in enumerate(ranked, start=1):
                rrf[pid] = rrf.get(pid, 0.0) + 1.0 / (RRF_K + r)
        return sorted(rrf, key=rrf.get, reverse=True)[:limit]


def summarize(rows):
    keys = ["hit@1", "hit@5", "recall@5", "recall@10", "recall@20", "mrr"]
    return {k: sum(r[k] for r in rows) / len(rows) for k in keys}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    model = get_embedding_model()
    tok = model.tokenizer
    n_tokens = lambda s: len(tok.tokenize(s))  # noqa: E731

    corpus = load_corpus()
    by_id = {c["chunk_id"]: c for c in corpus}

    # Baseline units: exactly what production has in Chroma (no template/khoan).
    got = get_collection().get(include=["embeddings", "metadatas"])
    base = [(cid, np.asarray(e, dtype=np.float32)) for cid, e, m in
            zip(got["ids"], got["embeddings"], got["metadatas"]) if m.get("chunk_type") != "template"]
    base_ids = [cid for cid, _ in base]
    base_vecs = np.vstack([v for _, v in base])
    base_bm25 = [by_id[c].get("embedding_text") or by_id[c]["text"] for c in base_ids]

    subs, long_ids = build_subchunks(corpus, n_tokens)
    sub_lens = sorted(n_tokens(s["text"]) for s in subs)
    print(f"Điều dài (> {MAX_TOKENS} token): {len(long_ids)}  -> sub-chunk: {len(subs)}")
    print(f"  sub-chunk token: median {sub_lens[len(sub_lens)//2]}, p90 {sub_lens[int(.9*len(sub_lens))]}, "
          f"> {MAX_TOKENS}: {sum(x > MAX_TOKENS for x in sub_lens)}")
    print("  theo văn bản:", dict(Counter(s['parent'].split('::')[0] for s in subs).most_common()))

    sub_vecs = embed_cached([s["text"] for s in subs], "subchunks")
    sub_ids = [s["id"] for s in subs]
    sub_parents = [s["parent"] for s in subs]
    sub_texts = [s["text"] for s in subs]

    keep_short = [i for i, c in enumerate(base_ids) if c not in long_ids]
    variants = {
        "baseline": Index(base_ids, base_ids, base_vecs, base_bm25),
        "+sub": Index(base_ids + sub_ids, base_ids + sub_parents,
                      np.vstack([base_vecs, sub_vecs]), base_bm25 + sub_texts),
        "sub-only": Index([base_ids[i] for i in keep_short] + sub_ids,
                          [base_ids[i] for i in keep_short] + sub_parents,
                          np.vstack([base_vecs[keep_short], sub_vecs]),
                          [base_bm25[i] for i in keep_short] + sub_texts),
    }

    cases = json.loads((ROOT / DATASET_PATH).read_text(encoding="utf-8"))
    qvecs = model.encode([c["question"] for c in cases], normalize_embeddings=True)

    results = {}
    for vname, idx in variants.items():
        for mode in ("dense", "bm25", "hybrid"):
            rows = []
            for case, qv in zip(cases, qvecs):
                if mode == "dense":
                    ranked = idx.dense(qv)
                elif mode == "bm25":
                    ranked = idx.bm25_rank(case["question"])
                else:
                    ranked = idx.hybrid(case["question"], qv)
                s = score_case(ranked, set(case["relevant"]))
                rows.append({"id": case["id"], "question": case["question"], "style": case["style"],
                             "domain": case["domain"], "top5": ranked[:5], **s})
            results[(vname, mode)] = rows

    print(f"\n{'biến thể':10} {'cách tìm':8}" + "".join(f"{k:>11}" for k in ["hit@1", "hit@5", "recall@10", "recall@20", "mrr"]))
    for (vname, mode), rows in results.items():
        s = summarize(rows)
        print(f"{vname:10} {mode:8}" + "".join(f"{s[k]:>11.3f}" for k in ["hit@1", "hit@5", "recall@10", "recall@20", "mrr"]))

    for vname in ("+sub", "sub-only"):
        print(f"\n--- hybrid: {vname} so với baseline (hạng của Điều đúng đầu tiên)")
        for b, n in zip(results[("baseline", "hybrid")], results[(vname, "hybrid")]):
            fb = "—" if b["mrr"] == 0 else int(b["first_rank"])
            fn = "—" if n["mrr"] == 0 else int(n["first_rank"])
            if fb != fn:
                tag = "tốt hơn" if (n["mrr"] > b["mrr"]) else "TỆ HƠN"
                print(f"  [{b['id']}] {fb:>2} -> {fn:>2}  {tag:8} {b['question']}")
        for grp in ("style", "domain"):
            for val in sorted({r[grp] for r in results[("baseline", "hybrid")]}):
                rb = [r for r in results[("baseline", "hybrid")] if r[grp] == val]
                rn = [r for r in results[(vname, "hybrid")] if r[grp] == val]
                print(f"  {grp}={val:11} hit@5 {summarize(rb)['hit@5']:.3f} -> {summarize(rn)['hit@5']:.3f}"
                      f"   mrr {summarize(rb)['mrr']:.3f} -> {summarize(rn)['mrr']:.3f}")

    out = ROOT / "data/eval/results/exp_khoan_chunks.json"
    out.write_text(json.dumps({f"{v}|{m}": rows for (v, m), rows in results.items()},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nĐã lưu: {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
