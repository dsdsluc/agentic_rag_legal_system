from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langsmith import traceable

from ingestion.models import ArticleChunk

load_dotenv()

CORPUS_PATH = Path("data/processed/corpus.jsonl")
FINE_MODEL = "gpt-4o-mini"
MAX_WORKERS = 8

# Traffic-fine amounts in this corpus range from a few hundred thousand to
# ~100 triệu đồng (organizations can be fined up to ~2x an individual's
# rate) — anything outside this band is almost certainly a digit an OCR
# garbled beyond what regex cleanup can trust (see the dieu_37::khoan_4 case
# below), not a real fine.
MIN_PLAUSIBLE = 10_000
MAX_PLAUSIBLE = 300_000_000

# Anchors on "phạt tiền" (fine-in-money) specifically — deliberately not
# "phạt" alone, which also matches non-monetary sanctions ("phạt bổ sung",
# "tước quyền sử dụng giấy phép") that have no amount to extract.
FINE_ANCHOR_RE = re.compile(r"[Pp]h[aạ]t ti[eề]n")

_NUM = r"[0-9](?:[0-9.\s]*[0-9])?"
# "từ X ... đến Y": the two connector words, not the currency word "đồng"
# itself, anchor the match — "đồng" OCRs into too many unpredictable shapes
# in this corpus (đong, ủng, ®ng, <ỉong...) to match reliably, whereas "từ"/
# "đến" hold up better. A run of digits/dots/spaces still needs stripping
# down to plain digits afterward — OCR sometimes drops a space after the
# thousands-separator dot ("40. 000.000").
_RANGE_RE = re.compile(
    rf"[Pp]h[aạ]t ti[eề]n\s+t[ừưu]\s*({_NUM}).{{0,25}}?đ[eêế]n\s*({_NUM})", re.DOTALL
)
# "phạt tiền đến Y" with no "từ" — either a single ceiling for one violation,
# or (for the Điều 42-47 "thẩm quyền xử phạt" chunks) a fining-authority cap
# rather than a violation's own fine range. Phase 2 doesn't distinguish the
# two — it stores whatever number the sentence states; which reading applies
# is for whoever consumes fine_max later to resolve from context.
_CAP_RE = re.compile(rf"[Pp]h[aạ]t ti[eề]n\s+đ[eêế]n\s*({_NUM})")

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

FINE_EXTRACT_PROMPT = """Bạn đọc một đoạn văn bản pháp luật xử phạt giao thông đường bộ Việt Nam (đã \
qua OCR, có thể có lỗi ký tự). Xác định mức phạt TIỀN (đơn vị đồng) mà đoạn này quy định, nếu có.

- Nếu đoạn nêu một khoảng "từ X đến Y đồng", trả về fine_min=X, fine_max=Y.
- Nếu đoạn chỉ nêu một mức trần "đến Y đồng" hoặc một mức cố định duy nhất, trả về fine_min=null, \
fine_max=Y.
- Nếu đoạn KHÔNG nêu một số tiền phạt cụ thể (ví dụ chỉ nói "ngoài việc bị phạt tiền" rồi nêu hình \
phạt bổ sung khác, hoặc tham chiếu mức phạt ở khoản/Điều khác mà không nhắc lại số), trả về \
fine_min=null, fine_max=null.
- Sửa lỗi OCR hiển nhiên trong số (khoảng trắng lạc giữa các chữ số, ký tự lẫn vào số) để trả về số \
nguyên đúng, dựa trên ngữ cảnh mức phạt giao thông thực tế (thường từ vài trăm nghìn đến vài chục \
triệu đồng, hiếm khi vượt 300 triệu đồng).

Trả lời DUY NHẤT một JSON hợp lệ, không markdown: {"fine_min": <số nguyên hoặc null>, "fine_max": \
<số nguyên hoặc null>}"""


def _clean_number(raw: str) -> int:
    return int(re.sub(r"[^0-9]", "", raw))


def _valid(fine_min: Optional[int], fine_max: int) -> bool:
    if not (MIN_PLAUSIBLE <= fine_max <= MAX_PLAUSIBLE):
        return False
    if fine_min is not None and not (MIN_PLAUSIBLE <= fine_min < fine_max):
        return False
    return True


def extract_fine_regex(text: str) -> Optional[tuple[Optional[int], int]]:
    """Regex-only pass — cheap, no LLM call. Returns None (not a (None,
    None) tuple) when inconclusive, so callers know to try the LLM fallback
    rather than treating "no match" as "confirmed no fine"."""
    m = _RANGE_RE.search(text)
    if m:
        fine_min, fine_max = _clean_number(m.group(1)), _clean_number(m.group(2))
        if _valid(fine_min, fine_max):
            return fine_min, fine_max
        return None
    m = _CAP_RE.search(text)
    if m:
        fine_max = _clean_number(m.group(1))
        if _valid(None, fine_max):
            return None, fine_max
        return None
    return None


@traceable(name="extract_fine_llm", run_type="chain")
def extract_fine_llm(text: str, llm: ChatOpenAI) -> Optional[tuple[Optional[int], Optional[int]]]:
    """LLM fallback for the ~10% of "phạt tiền"-anchored khoản the regex
    pass can't parse confidently — either the connector words are OCR-
    garbled beyond what the regex tolerates, or the khoản genuinely doesn't
    state a specific amount (references another clause, bổ sung sanction
    only). Returns (None, None) for the latter case rather than None, since
    the LLM has actually looked and concluded there's nothing to extract."""
    messages = [SystemMessage(content=FINE_EXTRACT_PROMPT), HumanMessage(content=text)]
    try:
        response = llm.invoke(messages)
        raw = _JSON_FENCE_RE.sub("", response.content).strip()
        data = json.loads(raw)
        fine_min = data.get("fine_min")
        fine_max = data.get("fine_max")
        fine_min = int(fine_min) if fine_min is not None else None
        fine_max = int(fine_max) if fine_max is not None else None
        if fine_max is not None and not _valid(fine_min, fine_max):
            return None
        return fine_min, fine_max
    except Exception:
        return None


def load_corpus(path: Path) -> list[ArticleChunk]:
    return [
        ArticleChunk.model_validate_json(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _extraction_targets(chunks: list[ArticleChunk]) -> list[ArticleChunk]:
    """Khoản chunks, plus the rare article chunk with no khoản children (a
    single-provision Điều never split by khoan_split.py) — but never a
    multi-khoản article's own chunk, whose text holds several different
    fine ranges at once and would only ever yield the first one, silently
    wrong for every other khoản in it."""
    khoan_parents = {c.parent_chunk_id for c in chunks if c.chunk_type == "khoan"}
    return [
        c
        for c in chunks
        if c.chunk_type == "khoan" or (c.chunk_type == "article" and c.chunk_id not in khoan_parents)
    ]


def annotate_fine_amounts(corpus_path: Path = CORPUS_PATH) -> None:
    chunks = load_corpus(corpus_path)
    targets = [c for c in _extraction_targets(chunks) if FINE_ANCHOR_RE.search(c.text)]

    regex_hits = 0
    llm_targets: list[ArticleChunk] = []
    resolved: dict[str, tuple[Optional[int], Optional[int]]] = {}

    for chunk in targets:
        match = extract_fine_regex(chunk.text)
        if match is not None:
            resolved[chunk.chunk_id] = match
            regex_hits += 1
        else:
            llm_targets.append(chunk)

    if llm_targets:
        llm = ChatOpenAI(model=FINE_MODEL, temperature=0)
        with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(llm_targets))) as pool:
            futures = {pool.submit(extract_fine_llm, c.text, llm): c for c in llm_targets}
            for future, chunk in futures.items():
                result = future.result()
                if result is not None:
                    resolved[chunk.chunk_id] = result

    for chunk in chunks:
        if chunk.chunk_id in resolved:
            fine_min, fine_max = resolved[chunk.chunk_id]
            chunk.fine_min = fine_min
            chunk.fine_max = fine_max

    with corpus_path.open("w", encoding="utf-8") as f:
        for chunk in chunks:
            f.write(chunk.model_dump_json() + "\n")

    with_amount = sum(1 for c in chunks if c.fine_max is not None)
    print(
        f"Fine-amount candidates: {len(targets)} (\"phạt tiền\" anchor) | "
        f"regex-resolved: {regex_hits} | LLM fallback attempted: {len(llm_targets)} | "
        f"total chunks with fine_max set: {with_amount} -> {corpus_path}"
    )


if __name__ == "__main__":
    annotate_fine_amounts()
