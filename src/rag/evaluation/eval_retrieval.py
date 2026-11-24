"""Retrieval-only evaluation: Recall@k, Hit@k and MRR against a hand-labelled
set of (question -> relevant chunk_id) pairs (data/eval/retrieval_set.json).

Unlike rag/evaluation/eval.py (LLM-judge on the final answer), this measures ONLY
whether the retriever puts the right Điều in front of the generator, so a
change to the embedding model, chunking or BM25 tokenization can be compared
in isolation — fast, deterministic, and (by default) zero OpenAI cost.

Usage (from the project root):

    PYTHONPATH=src python -m rag.evaluation.eval_retrieval                  # dense, bm25, hybrid, full (= retrieve() + rerank)
    PYTHONPATH=src python -m rag.evaluation.eval_retrieval --modes hybrid
    PYTHONPATH=src python -m rag.evaluation.eval_retrieval --label bge-m3   # tag the saved result file

Each run is saved to data/eval/results/retrieval_<timestamp>_<label>.json so
runs before/after a change can be diffed.

Metric definitions (per question, then averaged):
- Hit@k:    1 if ANY relevant chunk is in the top k, else 0.
- Recall@k: fraction of the question's relevant chunks found in the top k.
- MRR:      1 / rank of the first relevant chunk (0 if not in the top MAX_K).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Callable

DATASET_PATH = Path("data/eval/retrieval_set.json")
RESULTS_DIR = Path("data/eval/results")
KS = (1, 3, 5, 10, 20)
MAX_K = max(KS)
ALL_MODES = ("dense", "bm25", "hybrid", "full")


# Sub-unit hits ("subchunk": a khoản of a long Điều) are scored as their
# parent Điều — gold labels are Điều ids.
def _dense(question: str) -> list[str]:
    from rag.retrieval.retriever import UNIT_OVERFETCH, _dedupe_to_parents, _dense_search

    hits = _dense_search(question, MAX_K * UNIT_OVERFETCH)
    return _dedupe_to_parents([(cid, meta.get("parent_chunk_id") or None) for cid, meta, _ in hits], MAX_K)


def _bm25(question: str) -> list[str]:
    from rag.retrieval.bm25_index import bm25_search
    from rag.retrieval.retriever import UNIT_OVERFETCH, _dedupe_to_parents

    hits = bm25_search(question, MAX_K * UNIT_OVERFETCH)
    return _dedupe_to_parents(
        [(c.chunk_id, c.parent_chunk_id if c.chunk_type == "subchunk" else None) for c, _ in hits], MAX_K)


def _hybrid(question: str) -> list[str]:
    from rag.retrieval.retriever import _fused_search

    return [c.chunk_id for c in _fused_search([question], MAX_K)]


def _full(question: str) -> list[str]:
    # The production retrieve() (fusion + cross-encoder rerank), minus the
    # LLM khoản trimming / amendment / supersession steps that run after
    # ranking and would only add cost here — so this makes NO OpenAI call.
    # top_k=MAX_K so Recall@10/@20 are defined.
    from rag.retrieval.retriever import retrieve

    chunks = retrieve(question, top_k=MAX_K, include_amendments=False, trim_context=False,
                      apply_supersession_links=False)
    return [c.chunk_id for c in chunks]


MODE_FNS: dict[str, Callable[[str], list[str]]] = {
    "dense": _dense,
    "bm25": _bm25,
    "hybrid": _hybrid,
    "full": _full,
}


def score_case(ranked: list[str], relevant: set[str]) -> dict[str, float]:
    scores: dict[str, float] = {}
    for k in KS:
        found = relevant & set(ranked[:k])
        scores[f"hit@{k}"] = 1.0 if found else 0.0
        scores[f"recall@{k}"] = len(found) / len(relevant)
    first_rank = next((i for i, cid in enumerate(ranked[:MAX_K], start=1) if cid in relevant), None)
    scores["mrr"] = 1.0 / first_rank if first_rank else 0.0
    scores["first_rank"] = float(first_rank) if first_rank else float("nan")
    return scores


def _mean(rows: list[dict[str, float]], key: str) -> float:
    return sum(r[key] for r in rows) / len(rows) if rows else 0.0


def _summary(rows: list[dict[str, float]]) -> dict[str, float]:
    keys = [f"recall@{k}" for k in KS] + [f"hit@{k}" for k in KS] + ["mrr"]
    return {k: round(_mean(rows, k), 4) for k in keys} | {"n": len(rows)}


def run(modes: list[str], dataset_path: Path = DATASET_PATH) -> dict:
    cases = json.loads(dataset_path.read_text(encoding="utf-8"))
    report: dict = {"modes": {}}

    for mode in modes:
        fn = MODE_FNS[mode]
        per_case = []
        started = time.perf_counter()
        for i, case in enumerate(cases, 1):
            if i % 10 == 0:
                print(f"  [{mode}] {i}/{len(cases)}", flush=True)
            ranked = fn(case["question"])
            scores = score_case(ranked, set(case["relevant"]))
            per_case.append({
                "id": case["id"],
                "question": case["question"],
                "domain": case.get("domain", ""),
                "style": case.get("style", ""),
                "relevant": case["relevant"],
                "top5": ranked[:5],
                **scores,
            })
        elapsed = time.perf_counter() - started

        groups: dict[str, list[dict]] = defaultdict(list)
        for row in per_case:
            groups[f"domain={row['domain']}"].append(row)
            groups[f"style={row['style']}"].append(row)

        report["modes"][mode] = {
            "overall": _summary(per_case),
            "groups": {name: _summary(rows) for name, rows in sorted(groups.items())},
            "seconds": round(elapsed, 1),
            "cases": per_case,
        }
        # Printed as soon as each mode finishes, so stopping a long run
        # midway still leaves the finished modes' numbers on screen.
        _print_mode(mode, report["modes"][mode])
    return report


def _print_mode(mode: str, data: dict) -> None:
    cols = ["recall@1", "recall@5", "recall@10", "recall@20", "hit@5", "mrr"]
    header = f"{'':28}" + "".join(f"{c:>11}" for c in cols)
    print(f"\n=== {mode}  ({data['overall']['n']} câu, {data['seconds']}s)")
    print(header)
    print(f"{'TỔNG':28}" + "".join(f"{data['overall'][c]:>11.3f}" for c in cols))
    for name, s in data["groups"].items():
        label = f"{name} (n={s['n']})"
        print(f"{label:28}" + "".join(f"{s[c]:>11.3f}" for c in cols))

    misses = [c for c in data["cases"] if c["hit@5"] == 0.0]
    if misses:
        print(f"\n  Trượt top-5 ({len(misses)}):")
        for c in misses:
            rank = "không có trong top 20" if c["mrr"] == 0 else f"hạng {int(c['first_rank'])}"
            print(f"   - [{c['id']}] {c['question']}  -> đáp án {rank}")
    sys.stdout.flush()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--modes", nargs="+", choices=list(MODE_FNS), default=list(ALL_MODES))
    parser.add_argument("--label", default="", help="tag for the saved result file, e.g. the model name")
    parser.add_argument("--dataset", type=Path, default=DATASET_PATH)
    args = parser.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    modes = list(dict.fromkeys(args.modes))
    report = run(modes, args.dataset)

    from ingestion.index.embed import EMBEDDING_MODEL_DIR

    report["meta"] = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "label": args.label,
        "embedding_model": EMBEDDING_MODEL_DIR.name,
        "dataset": str(args.dataset),
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    suffix = f"_{args.label}" if args.label else ""
    out = RESULTS_DIR / f"retrieval_{datetime.now():%Y%m%d_%H%M%S}{suffix}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nĐã lưu: {out}")


if __name__ == "__main__":
    main()
