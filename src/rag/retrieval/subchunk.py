from __future__ import annotations

import json
import re
from typing import Optional

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langsmith import traceable

from ingestion.chunking.khoan_split import KhoanSegment, split_khoan

from rag.generation import usage

load_dotenv()

# Đ168's "vehicle-type" articles run ~13-19KB covering 16+ unrelated
# violations each — a colloquial single-violation question ("vượt đèn đỏ
# mất bao nhiêu tiền?") only needs one khoản (clause) out of that, but the
# whole article was being sent to the LLM regardless. This trims a large
# matched article down to its most relevant khoản before it goes into the
# prompt — precision AND token cost, not "retrieve more".
#
# First version used embedding cosine-similarity to pick the khoản, per the
# original plan's preferred (cheap, no LLM call) option. Eval caught a full
# ranking inversion: for a helmet-fine question, the WRONG khoản scored 0.35
# while the actually-correct one scored 0.16 — not a threshold-tuning
# problem, the embedding model just isn't precise enough at this granularity
# on short, dense Vietnamese legal clauses. Switched to LLM-based selection
# (the plan's fallback option), now the primary and only mechanism.
#
# split_khoan/KhoanSegment now live in ingestion.chunking.khoan_split, which also
# runs this same boundary regex once at ingestion time to materialize
# addressable khoản chunks — imported here rather than duplicated so the two
# call sites can't drift apart.
MIN_LEN_FOR_TRIM = 1500
KHOAN_SELECT_MODEL = "gpt-4o-mini"

KHOAN_SELECT_PROMPT = """Bạn được cho một Điều luật xử phạt giao thông đường bộ Việt Nam, chia \
thành các khoản được đánh số. Với hành vi vi phạm hoặc câu hỏi được nêu, xác định khoản nào mô tả \
ĐÚNG mức xử phạt hoặc nội dung liên quan trực tiếp nhất. Hành vi cần tìm có thể chỉ được liệt kê ở \
một điểm (a, b, c...) bên trong khoản, không nhất thiết là ý chính đầu khoản — hãy đọc hết nội dung \
từng khoản trước khi kết luận không có khoản nào phù hợp.

Chỉ trả về null nếu THỰC SỰ không có khoản nào liên quan đến hành vi/câu hỏi được nêu trong toàn bộ \
các khoản đã cho. Nếu có một khoản phù hợp (kể cả chỉ phù hợp một phần), luôn chọn khoản đó.

Trả lời DUY NHẤT một JSON hợp lệ, không markdown: {"khoan_number": <số nguyên hoặc null>}"""

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


@traceable(name="select_khoan", run_type="chain")
def _select_khoan_llm(segments: list[KhoanSegment], query: str) -> Optional[int]:
    listing = "\n\n".join(f"[Khoản {s.khoan_number}]\n{s.text}" for s in segments)
    llm = ChatOpenAI(model=KHOAN_SELECT_MODEL, temperature=0, max_tokens=100, timeout=15, max_retries=2)
    messages = [
        SystemMessage(content=KHOAN_SELECT_PROMPT),
        HumanMessage(content=f"Hành vi/câu hỏi: {query}\n\n{listing}"),
    ]
    try:
        response = llm.invoke(messages)
        usage.record_response("khoan_select", KHOAN_SELECT_MODEL, response)
        raw = _JSON_FENCE_RE.sub("", response.content).strip()
        data = json.loads(raw)
        khoan_number = data.get("khoan_number")
        return int(khoan_number) if khoan_number is not None else None
    except Exception:
        return None


@traceable(name="trim_to_khoan", run_type="chain")
def find_best_khoan(
    article_text: str, query: str, heading: str = ""
) -> Optional[tuple[str, int, float]]:
    """Return (excerpt_text, khoan_number, confidence) for the khoản segment
    an LLM identifies as matching `query`, or None if the article is too
    short to bother trimming, has no clean khoản structure, or the model
    couldn't confidently identify a match — callers should keep the full
    article text in that case rather than risk excerpting the wrong clause."""
    if len(article_text) < MIN_LEN_FOR_TRIM:
        return None
    segments = split_khoan(article_text)
    if not segments:
        return None

    khoan_number = _select_khoan_llm(segments, query)
    if khoan_number is None:
        return None
    matched = next((s for s in segments if s.khoan_number == khoan_number), None)
    if matched is None:
        return None

    excerpt = f"{heading}\n{matched.text}".strip() if heading else matched.text
    return excerpt, matched.khoan_number, 1.0
