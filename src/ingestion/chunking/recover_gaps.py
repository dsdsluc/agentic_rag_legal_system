from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langsmith import traceable

from ingestion.models import ArticleChunk

load_dotenv()

CORPUS_PATH = Path("data/processed/corpus.jsonl")
RECOVERY_MODEL = "gpt-4o-mini"

# Targeted repair for a specific, now-confirmed OCR failure mode: Tesseract
# occasionally drops just the word "Điều" from a heading line (e.g. "Điều 7."
# comes out as " 7."), so the article-boundary regex never matches it and its
# text silently lands inside the previous article's chunk (detected via a
# gap in the article-number sequence — see article_split.py). The OCR text
# itself is usually fine; only the boundary was missed. Rather than a vision
# re-OCR pass, ask an LLM to locate the missing heading within the already-
# extracted text and split there.
RECOVERY_SYSTEM_PROMPT = """Bạn phân tích văn bản pháp luật Việt Nam đã được trích xuất bằng OCR, \
trong đó một số tiêu đề "Điều N." bị lỗi OCR làm mất từ "Điều" (ví dụ tiêu đề thật là "Điều 7. Xử \
phạt..." nhưng OCR chỉ nhận ra " 7. Xử phạt..."). Bạn sẽ nhận một đoạn văn bản dài (bị ghép nhiều Điều \
lại do lỗi này) và danh sách các số Điều còn thiếu.

Với mỗi số Điều thiếu, tìm vị trí trong văn bản nơi Điều đó thực sự bắt đầu — thường là một dòng bắt \
đầu bằng chính xác số đó, theo sau là dấu chấm rồi một câu tiêu đề ngắn mô tả nội dung của cả Điều \
(KHÔNG PHẢI là số thứ tự của một khoản/điểm liệt kê bên trong nội dung, ví dụ "1. Phạt tiền từ..." \
không phải là tiêu đề Điều). Với mỗi Điều tìm được, trả về "start_text": 8-15 từ đầu tiên NGUYÊN VĂN \
(copy chính xác từng ký tự từ văn bản gốc) bắt đầu từ số đó, đủ dài để xác định vị trí duy nhất.

Nếu không tìm thấy một Điều nào đó trong văn bản, bỏ qua nó — đừng bịa ra start_text không có thật.

Trả lời DUY NHẤT một JSON hợp lệ, không markdown, dạng:
{"found": [{"number": 7, "start_text": "7. Xử phạt, trừ điểm giấy phép lái của người điều khiển xe mô tô,"}]}"""

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def load_corpus(path: Path = CORPUS_PATH) -> list[ArticleChunk]:
    return [
        ArticleChunk.model_validate_json(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def find_gaps(chunks: list[ArticleChunk]) -> dict[str, list[tuple[int, list[int]]]]:
    """doc_id -> [(absorbing_article_number, [missing_numbers]), ...]"""
    by_doc: dict[str, list[ArticleChunk]] = defaultdict(list)
    for c in chunks:
        if c.chunk_type == "article":
            by_doc[c.doc_id].append(c)

    result: dict[str, list[tuple[int, list[int]]]] = defaultdict(list)
    for doc_id, doc_chunks in by_doc.items():
        articles = sorted(doc_chunks, key=lambda c: c.article_number)
        for i in range(len(articles) - 1):
            a, b = articles[i].article_number, articles[i + 1].article_number
            if b > a + 1:
                result[doc_id].append((a, list(range(a + 1, b))))
    return result


@traceable(name="recover_gap_headings", run_type="chain")
def _find_split_points(text: str, missing_numbers: list[int], llm: ChatOpenAI) -> dict[int, str]:
    human = f"Các số Điều còn thiếu: {missing_numbers}\n\nVăn bản:\n{text}"
    response = llm.invoke([SystemMessage(content=RECOVERY_SYSTEM_PROMPT), HumanMessage(content=human)])
    raw = _JSON_FENCE_RE.sub("", response.content).strip()
    try:
        data = json.loads(raw)
        return {int(item["number"]): str(item["start_text"]) for item in data.get("found", [])}
    except Exception:
        return {}


def _split_chunk(chunk: ArticleChunk, missing_numbers: list[int], llm: ChatOpenAI) -> list[ArticleChunk]:
    split_map = _find_split_points(chunk.text, missing_numbers, llm)
    if not split_map:
        return [chunk]

    positions: list[tuple[int, int]] = []
    for number, start_text in split_map.items():
        idx = chunk.text.find(start_text)
        if idx != -1:
            positions.append((idx, number))
    if not positions:
        return [chunk]
    positions.sort()

    boundaries = [0] + [p[0] for p in positions] + [len(chunk.text)]
    out: list[ArticleChunk] = []
    out.append(chunk.model_copy(update={"text": chunk.text[boundaries[0] : boundaries[1]].strip()}))
    for i, (_, number) in enumerate(positions):
        seg_text = chunk.text[boundaries[i + 1] : boundaries[i + 2]].strip()
        heading_line = seg_text.split("\n", 1)[0]
        heading = heading_line.split(".", 1)[1].strip() if "." in heading_line else None
        out.append(
            chunk.model_copy(
                update={
                    "chunk_id": f"{chunk.doc_id}::dieu_{number}",
                    "article_number": number,
                    "article_heading": heading or None,
                    "text": seg_text,
                }
            )
        )
    return out


def recover_gaps(corpus_path: Path = CORPUS_PATH) -> None:
    chunks = load_corpus(corpus_path)
    gaps = find_gaps(chunks)
    if not gaps:
        print("No gaps found.")
        return

    by_chunk_id = {c.chunk_id: c for c in chunks}
    llm = ChatOpenAI(model=RECOVERY_MODEL, temperature=0)

    replacements: dict[str, list[ArticleChunk]] = {}
    recovered_count = 0
    unrecovered: list[tuple[str, int]] = []

    for doc_id, doc_gaps in gaps.items():
        for absorbing_number, missing_numbers in doc_gaps:
            chunk_id = f"{doc_id}::dieu_{absorbing_number}"
            chunk = by_chunk_id.get(chunk_id)
            if chunk is None:
                continue
            split = _split_chunk(chunk, missing_numbers, llm)
            replacements[chunk_id] = split
            found_numbers = {c.article_number for c in split[1:]}
            recovered_count += len(found_numbers)
            for n in missing_numbers:
                if n not in found_numbers:
                    unrecovered.append((doc_id, n))

    new_chunks: list[ArticleChunk] = []
    for c in chunks:
        if c.chunk_id in replacements:
            new_chunks.extend(replacements[c.chunk_id])
        else:
            new_chunks.append(c)

    with corpus_path.open("w", encoding="utf-8") as f:
        for c in new_chunks:
            f.write(c.model_dump_json() + "\n")

    total_missing = sum(len(m) for gs in gaps.values() for _, m in gs)
    print(f"Recovered {recovered_count}/{total_missing} missing articles -> {corpus_path}")
    if unrecovered:
        print(f"Still missing ({len(unrecovered)}): {unrecovered}")


if __name__ == "__main__":
    recover_gaps()
