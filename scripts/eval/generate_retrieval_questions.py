"""Generate CANDIDATE retrieval-eval questions with gpt-4o-mini, for human
review before they are merged into data/eval/retrieval_set.json.

- Samples substantive Điều not already used as gold in retrieval_set.json,
  stratified by domain; for long Điều, one random khoản is the source so the
  question is specific.
- One question per source; ~70% asked "like an ordinary citizen" (no legal
  jargon copied from the excerpt, no Điều number / document name), ~30% in
  formal legal wording.
- Gold = the source Điều. Output keeps the source excerpt so a reviewer can
  check the question really is answered there (and only there).

Writes data/eval/retrieval_set_candidates.json (never touches the real set).

Usage (from project root):
    PYTHONPATH=src python scripts/eval/generate_retrieval_questions.py
"""
from __future__ import annotations

import json
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from dotenv import load_dotenv  # noqa: E402
from langchain_core.messages import HumanMessage, SystemMessage  # noqa: E402
from langchain_openai import ChatOpenAI  # noqa: E402

from ingestion.chunking.khoan_split import split_khoan  # noqa: E402

load_dotenv(ROOT / ".env")

CORPUS = ROOT / "data/processed/corpus.jsonl"
GOLD = ROOT / "data/eval/retrieval_set.json"
OUT = ROOT / "data/eval/retrieval_set_candidates.json"
MODEL = "gpt-4o-mini"
SEED = 20261124
TARGET = {"giao_thong": 50, "dan_su": 40, "hinh_su": 40}
COLLOQUIAL_SHARE = 0.7
# Amendment-only documents ("Sửa đổi, bổ sung Điều X ...") — questions about
# them really target the amended document, so they make ambiguous gold.
SKIP_DOCS = {"ND_238_2026", "ND_241_2026", "TT_17_2026_TT_BXD", "TT_105_2026_TT_BCA", "LUAT_12_2017_QH14"}
SKIP_HEADING = re.compile(
    r"phạm vi|đối tượng|giải thích từ ngữ|hiệu lực|thi hành|chuyển tiếp|trách nhiệm của bộ|"
    r"tổ chức thực hiện|sửa đổi|bãi bỏ|nhiệm vụ của|áp dụng", re.IGNORECASE)

SYSTEM = """Bạn tạo câu hỏi kiểm thử cho một hệ thống tra cứu pháp luật Việt Nam.
Cho một đoạn trích văn bản luật, hãy viết ĐÚNG MỘT câu hỏi mà đoạn trích này trả lời được.

Yêu cầu chung:
- Câu hỏi phải có câu trả lời CỤ THỂ nằm trong đoạn trích (mức phạt, điều kiện, thời hạn, ai, khi nào...).
- KHÔNG nhắc số Điều, số Khoản, tên hay số hiệu văn bản.
- Câu hỏi ngắn gọn, tự nhiên, một câu.

Nếu kiểu = "colloquial": viết như một người dân bình thường hỏi trên mạng, dùng từ ngữ đời thường
(ví dụ "xe máy" thay vì "xe mô tô, xe gắn máy", "vượt đèn đỏ" thay vì "không chấp hành hiệu lệnh
của đèn tín hiệu", "bằng lái" thay vì "giấy phép lái xe"). TRÁNH chép nguyên cụm từ pháp lý của đoạn trích.
Nếu kiểu = "formal": dùng thuật ngữ pháp lý chính xác như người làm luật hỏi.

Nếu đoạn trích không đủ nội dung để hỏi (chỉ là định nghĩa chung, thủ tục hành chính rời rạc,
văn bản lỗi khó đọc), trả về question rỗng.

Trả lời DUY NHẤT JSON: {"question": "..."}"""


def load_corpus() -> list[dict]:
    return [json.loads(line) for line in CORPUS.read_text(encoding="utf-8").splitlines() if line.strip()]


def pick_sources(corpus: list[dict], used: set[str]) -> list[dict]:
    rng = random.Random(SEED)
    pools: dict[str, list[dict]] = {d: [] for d in TARGET}
    for c in corpus:
        if (c["chunk_type"] != "article" or c["chunk_id"] in used or c["doc_id"] in SKIP_DOCS
                or str(c.get("needs_review")) == "True" or len(c["text"]) < 300
                or SKIP_HEADING.search(c.get("article_heading") or "") or c.get("domain") not in TARGET):
            continue
        pools[c["domain"]].append(c)

    sources = []
    for domain, n in TARGET.items():
        for art in rng.sample(pools[domain], min(n, len(pools[domain]))):
            khoans = [k.text for k in split_khoan(art["text"]) if len(k.text) > 150]
            excerpt = rng.choice(khoans) if len(art["text"]) > 1500 and khoans else art["text"]
            style = "colloquial" if rng.random() < COLLOQUIAL_SHARE else "formal"
            sources.append({"article": art, "excerpt": excerpt[:2500], "style": style})
    return sources


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    gold = json.loads(GOLD.read_text(encoding="utf-8"))
    used = {cid for case in gold for cid in case["relevant"]}
    sources = pick_sources(load_corpus(), used)
    print(f"Chọn {len(sources)} đoạn nguồn ({TARGET}); gọi {MODEL}...", flush=True)

    llm = ChatOpenAI(model=MODEL, temperature=0.7, max_tokens=150, timeout=30, max_retries=2)
    out, skipped = [], 0
    counters = {"giao_thong": 0, "dan_su": 0, "hinh_su": 0}
    prefix = {"giao_thong": "ngt", "dan_su": "nds", "hinh_su": "nhs"}
    for i, src in enumerate(sources, 1):
        art = src["article"]
        user = (f"Kiểu: {src['style']}\nTiêu đề: Điều {art['article_number']}. {art.get('article_heading') or ''}\n"
                f"Đoạn trích:\n{src['excerpt']}")
        try:
            raw = llm.invoke([SystemMessage(content=SYSTEM), HumanMessage(content=user)]).content
            question = json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())).get("question", "").strip()
        except Exception as exc:  # keep going; a reviewer will see the gap
            print(f"  lỗi ở {art['chunk_id']}: {exc}", flush=True)
            question = ""
        if not question:
            skipped += 1
            continue
        d = art["domain"]
        counters[d] += 1
        out.append({
            "id": f"{prefix[d]}{counters[d]:02d}",
            "question": question,
            "relevant": [art["chunk_id"]],
            "domain": d,
            "style": src["style"],
            "source": "gpt-4o-mini",
            "reviewed": False,
            "source_heading": f"{art['doc_title']} — Điều {art['article_number']}. {art.get('article_heading') or ''}",
            "source_excerpt": src["excerpt"][:600],
        })
        if i % 20 == 0:
            print(f"  {i}/{len(sources)}", flush=True)

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Xong: {len(out)} câu ứng viên, bỏ {skipped} đoạn không đủ nội dung -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
