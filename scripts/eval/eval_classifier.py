"""Measure the input classifier (investigation/input_processing/).

Legal questions (retrieval_set.json + retrieval_set_candidates.json): gold
domains = the domains of the gold Điều. Reports, for the OLD classifier
(classify_domains) and the NEW one (classify_question, scope + domains):
  - safe     : every gold domain is in the predicted set (the domain filter
               can't drop the right Điều)
  - narrowed : predicted fewer than all 3 domains (the filter actually helps)
  - rejected : NEW only — scope != phap_luat on a real legal question (must be 0)

Scope set (scope_set.json): off-topic / attack / tricky-but-legal messages,
accuracy of the NEW scope label per expected class.

~240 gpt-4o-mini calls per classifier. Usage (from project root):
    PYTHONPATH=src python scripts/eval/eval_classifier.py
"""
from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from rag.input.domain_classify import ALL_DOMAINS, SCOPE_LEGAL, classify_domains, classify_question  # noqa: E402

LEGAL_SETS = ["data/eval/retrieval_set.json", "data/eval/retrieval_set_candidates.json"]
SCOPE_SET = "data/eval/scope_set.json"

# --quick: 30 calls total, NEW classifier only. Legal: 5 per domain from the
# hand-written set, incl. multi-domain ones (hs06 traffic-death, ds10 owner
# liability); scope: 5 off-topic, 5 attacks, 5 tricky-but-legal.
QUICK_LEGAL_IDS = {"gt01", "gt05", "gt12", "gt20", "gt28",
                   "ds03", "ds04", "ds10", "ds16", "ds18",
                   "hs04", "hs06", "hs08", "hs10", "hs15"}
QUICK_SCOPE_IDS = {"off01", "off02", "off10", "off11", "off15",
                   "atk01", "atk03", "atk05", "atk08", "atk10",
                   "leg01", "leg04", "leg07", "leg08", "leg17"}


def pmap(fn, items):
    with ThreadPoolExecutor(max_workers=8) as pool:
        return list(pool.map(fn, items))


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    domain_of = {}
    for line in (ROOT / "data/processed/corpus.jsonl").read_text(encoding="utf-8").splitlines():
        c = json.loads(line)
        domain_of[c["chunk_id"]] = c["domain"]

    quick = "--quick" in sys.argv
    legal = []
    for path in LEGAL_SETS[:1] if quick else LEGAL_SETS:
        for case in json.loads((ROOT / path).read_text(encoding="utf-8")):
            if quick and case["id"] not in QUICK_LEGAL_IDS:
                continue
            legal.append({**case, "gold": {domain_of[r] for r in case["relevant"]}})
    qs = [c["question"] for c in legal]
    print(f"Câu hỏi pháp luật: {len(legal)} — gọi bộ phân loại {'mới' if quick else 'cũ và mới'}...", flush=True)
    new = pmap(classify_question, qs)
    old = None if quick else pmap(classify_domains, qs)

    def report(name, preds):
        safe = sum(c["gold"] <= set(p) for c, p in zip(legal, preds))
        narrowed = sum(len(p) < len(ALL_DOMAINS) for p in preds)
        print(f"  {name:4} an toàn {safe}/{len(legal)} ({safe / len(legal):.1%}) · "
              f"thu hẹp {narrowed}/{len(legal)} ({narrowed / len(legal):.1%})")

    if old is not None:
        report("CŨ", old)
    report("MỚI", [n.domains for n in new])
    rejected = [(c, n) for c, n in zip(legal, new) if n.scope != SCOPE_LEGAL]
    print(f"  MỚI từ chối nhầm câu pháp luật: {len(rejected)}")
    for c, n in rejected:
        print(f"    - [{c['id']}] {n.scope}: {c['question']}")
    for name, preds in ((("CŨ", old),) if old is not None else ()) + (("MỚI", [n.domains for n in new]),):
        unsafe = [(c, p) for c, p in zip(legal, preds) if not c["gold"] <= set(p)]
        print(f"  {name} lọc mất lĩnh vực đúng ({len(unsafe)}):")
        for c, p in unsafe:
            print(f"    - [{c['id']}] cần {sorted(c['gold'])}, đoán {list(p)}: {c['question']}")

    scope_cases = json.loads((ROOT / SCOPE_SET).read_text(encoding="utf-8"))
    if quick:
        scope_cases = [c for c in scope_cases if c["id"] in QUICK_SCOPE_IDS]
    print(f"\nBộ phạm vi: {len(scope_cases)} câu", flush=True)
    preds = pmap(classify_question, [c["question"] for c in scope_cases])
    for expected in ("phap_luat", "ngoai_pham_vi", "nghi_tan_cong"):
        group = [(c, p) for c, p in zip(scope_cases, preds) if c["expected"] == expected]
        ok = sum(p.scope == expected for _, p in group)
        print(f"  {expected:14} đúng {ok}/{len(group)}")
        for c, p in group:
            if p.scope != expected:
                print(f"    - [{c['id']}] đoán {p.scope}: {c['question']}")


if __name__ == "__main__":
    main()
