from __future__ import annotations

import json
import re
from functools import lru_cache

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langsmith import traceable

from . import usage

load_dotenv()

DOMAIN_CLASSIFY_MODEL = "gpt-4o-mini"

ALL_DOMAINS = ("giao_thong", "dan_su", "hinh_su")

# Deliberately a SEPARATE, small LLM call rather than folded into
# rewrite_query() (see architecture/strategy.txt §2, which originally
# proposed merging the two to save a call) — query_rewrite's own prompt is
# structurally hardcoded to traffic-law intent (violation/vehicle_type/
# info_need) and generalizing it is a bigger, eval-gated change (strategy.txt
# §7 Bước 2-3). Keeping this classifier isolated means it can ship now
# without touching the already-validated traffic pipeline at all, at the
# cost of one extra cheap gpt-4o-mini call per auto-mode question. Revisit
# merging once query_rewrite itself is generalized.
DOMAIN_CLASSIFY_PROMPT = """Bạn phân loại một câu hỏi pháp luật tiếng Việt vào MỘT HOẶC NHIỀU lĩnh vực \
sau đây (một câu hỏi có thể liên quan đến nhiều lĩnh vực cùng lúc, ví dụ "tai nạn giao thông gây chết \
người thì xử lý thế nào" vừa cần "giao_thong" vừa cần "hinh_su" — có thể cả "dan_su" nếu hỏi cả về bồi \
thường):

- "giao_thong": Luật giao thông đường bộ — quy tắc lưu thông, xử phạt vi phạm hành chính, bằng lái xe, \
đăng kiểm, phương tiện giao thông.
- "dan_su": Pháp luật dân sự — hợp đồng, tài sản, thừa kế, giao dịch dân sự, bồi thường thiệt hại \
ngoài hợp đồng, tố tụng dân sự.
- "hinh_su": Pháp luật hình sự — tội danh, khung hình phạt tù, trách nhiệm hình sự, tố tụng hình sự.

Nếu câu hỏi KHÔNG rõ ràng thuộc lĩnh vực nào trong 3 lĩnh vực trên, hoặc có thể liên quan đến CẢ BA, \
hãy trả về cả 3.

Trả lời DUY NHẤT một JSON hợp lệ, không markdown, theo định dạng: {"domains": ["giao_thong", ...]}"""

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


@lru_cache(maxsize=256)
@traceable(name="classify_domains", run_type="chain")
def classify_domains(question: str) -> list[str]:
    """Classify which of the 3 legal domains (giao_thong/dan_su/hinh_su) a
    question relates to — a LIST, since a real question can legitimately
    span more than one (a traffic accident can touch giao_thong, dan_su
    compensation, and hinh_su liability all at once). Falls back to ALL
    THREE domains (i.e. no retrieval filter — search the whole corpus,
    same as before this feature existed) on any LLM/parse failure or an
    empty/invalid result, so a classifier hiccup never causes retrieval to
    silently miss the right document, only to search more broadly than
    strictly necessary."""
    llm = ChatOpenAI(model=DOMAIN_CLASSIFY_MODEL, temperature=0, max_tokens=100, timeout=10, max_retries=2)
    messages = [SystemMessage(content=DOMAIN_CLASSIFY_PROMPT), HumanMessage(content=question)]
    try:
        response = llm.invoke(messages)
        usage.record_response("classify_domains", DOMAIN_CLASSIFY_MODEL, response)
        raw = _JSON_FENCE_RE.sub("", response.content).strip()
        data = json.loads(raw)
        domains = data.get("domains")
        if isinstance(domains, list):
            cleaned = [d for d in domains if d in ALL_DOMAINS]
            # dedupe, keep ALL_DOMAINS order for a stable, predictable list
            cleaned = [d for d in ALL_DOMAINS if d in cleaned]
            if cleaned:
                return cleaned
    except Exception:
        pass
    return list(ALL_DOMAINS)
