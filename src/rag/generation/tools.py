from __future__ import annotations

from functools import lru_cache
from typing import Optional

from langchain_core.tools import tool

from ingestion.index.load_vectorstore import load_corpus
from ingestion.models import ArticleChunk
from rag.retrieval.retriever import _scoped_context_search, retrieve


@lru_cache(maxsize=1)
def _build_lookup_index() -> tuple[dict[tuple[str, int], dict], dict[str, str]]:
    """(doc_id, dieu_number) -> {"article": chunk|None, "khoan": {khoan_number: chunk|"ambiguous"}},
    plus doc_id -> doc_title. Built once from the same cached load_corpus()
    the rest of the app uses (ingestion/index/load_vectorstore.py), so this stays
    in sync with whatever the server started with — a fresh ingestion run
    needs a server restart either way (documented on load_corpus itself).

    A known pre-existing ingestion bug (see plans/plan_2.txt §2.6) means a
    handful of (doc_id, dieu_number, khoan_number) keys have MULTIPLE
    corpus.jsonl entries with genuinely different text — usually an annex
    ("Phụ lục"/"Mẫu" form) or a neighboring Điều's content that bled into
    this article's raw text during extraction, so khoan_split found the
    same "N." boundary twice. Picking one silently would be a coin flip on
    which is real — instead this marks such a key "ambiguous" so get_khoan
    can refuse and say so, rather than guess."""
    by_article: dict[tuple[str, int], dict] = {}
    doc_titles: dict[str, str] = {}
    for chunk in load_corpus():
        doc_titles.setdefault(chunk.doc_id, chunk.doc_title)
        if chunk.article_number is None:
            continue
        key = (chunk.doc_id, chunk.article_number)
        entry = by_article.setdefault(key, {"article": None, "khoan": {}})
        if chunk.chunk_type == "article":
            entry["article"] = chunk
        elif chunk.chunk_type == "khoan" and chunk.khoan_number is not None:
            existing = entry["khoan"].get(chunk.khoan_number)
            if existing is not None and existing != "ambiguous" and existing.text != chunk.text:
                entry["khoan"][chunk.khoan_number] = "ambiguous"
            elif existing != "ambiguous":
                entry["khoan"][chunk.khoan_number] = chunk
    return by_article, doc_titles


def _review_note(chunk: ArticleChunk) -> str:
    return " [OCR CHƯA XÁC MINH]" if chunk.needs_review else ""


@tool
def get_article(doc_id: str, dieu_number: int) -> str:
    """Lấy toàn văn một Điều cụ thể của một văn bản pháp luật trong kho dữ liệu, kể cả khi Điều đó
    KHÔNG nằm trong phần Ngữ cảnh đã cung cấp. Dùng khi câu hỏi hoặc một đoạn Ngữ cảnh tham chiếu tới
    một Điều khác (ví dụ "theo quy định tại Điều 5 văn bản này") mà nội dung Điều đó chưa xuất hiện
    trong Ngữ cảnh, và bạn cần đọc nó để trả lời chính xác. doc_id lấy từ phần "(doc_id: ...)" ghi kèm
    mỗi nguồn trong Ngữ cảnh.
    """
    by_article, doc_titles = _build_lookup_index()
    entry = by_article.get((doc_id, dieu_number))
    if entry is None or entry["article"] is None:
        title = doc_titles.get(doc_id, doc_id)
        return f"Không tìm thấy Điều {dieu_number} trong văn bản '{title}' (doc_id: {doc_id}) trong kho dữ liệu."
    chunk = entry["article"]
    return f"{chunk.doc_title}, Điều {dieu_number}{_review_note(chunk)}:\n{chunk.text}"


@tool
def get_khoan(doc_id: str, dieu_number: int, khoan_number: int) -> str:
    """Lấy nội dung một khoản cụ thể trong một Điều của một văn bản pháp luật trong kho dữ liệu, kể cả
    khi khoản đó KHÔNG nằm trong phần Ngữ cảnh đã cung cấp. Dùng khi cần đối chiếu một khoản cụ thể
    được tham chiếu tới (ví dụ "trừ trường hợp quy định tại khoản 3 Điều 5") mà nội dung khoản đó chưa
    có trong Ngữ cảnh. doc_id lấy từ phần "(doc_id: ...)" ghi kèm mỗi nguồn trong Ngữ cảnh.
    """
    by_article, doc_titles = _build_lookup_index()
    entry = by_article.get((doc_id, dieu_number))
    if entry is None:
        title = doc_titles.get(doc_id, doc_id)
        return f"Không tìm thấy Điều {dieu_number} trong văn bản '{title}' (doc_id: {doc_id}) trong kho dữ liệu."
    chunk = entry["khoan"].get(khoan_number)
    if chunk is None:
        return f"Không tìm thấy Khoản {khoan_number} của Điều {dieu_number} trong văn bản '{doc_id}'."
    if chunk == "ambiguous":
        return (
            f"Dữ liệu cho Khoản {khoan_number} của Điều {dieu_number} (doc_id: {doc_id}) hiện không rõ "
            f"ràng trong kho dữ liệu (lỗi trích xuất đã biết — có nhiều đoạn khác nhau cùng gắn nhãn "
            f"khoản này). Hãy dựa vào toàn văn Điều lấy qua get_article thay vì khoản riêng lẻ này, hoặc "
            f"nói rõ với người dùng là cần đối chiếu văn bản gốc."
        )
    return f"{chunk.doc_title}, Điều {dieu_number}, Khoản {khoan_number}{_review_note(chunk)}:\n{chunk.text}"


def _format_vnd(amount: int) -> str:
    # Vietnamese convention uses "." as the thousands separator (e.g.
    # "400.000 đồng"), not ",": format with the standard comma grouping
    # then swap the separator rather than hand-rolling grouping logic.
    return f"{amount:,}".replace(",", ".")


@tool
def search_corpus(query: str, doc_id: Optional[str] = None, top_k: int = 5) -> str:
    """Tìm kiếm THÊM trong kho dữ liệu pháp luật bằng một câu hỏi/từ khóa khác, khi Ngữ cảnh ban đầu
    chưa đủ để trả lời đầy đủ — ví dụ câu hỏi cần đối chiếu quy định cho một loại phương tiện khác,
    một khía cạnh khác của câu hỏi mà lượt tìm kiếm đầu không tìm đủ, hoặc bạn cần tìm một Điều/chủ đề
    khác chưa biết trước số Điều cụ thể (nếu đã biết đúng số Điều/Khoản, dùng get_article/get_khoan
    thay vì tool này vì chính xác hơn). Có thể giới hạn tìm trong một văn bản cụ thể bằng doc_id (lấy
    từ phần "(doc_id: ...)" ghi kèm mỗi nguồn) nếu biết chắc câu trả lời nằm trong văn bản đó; để trống
    (không truyền doc_id) nếu muốn tìm trên toàn bộ kho dữ liệu.
    """
    if doc_id:
        chunks = _scoped_context_search(query, doc_id, exclude_chunk_ids=set(), k=top_k)
    else:
        chunks = retrieve(
            query,
            top_k=top_k,
            use_graph_expansion=False,
            include_amendments=False,
            trim_context=True,
        )
    if not chunks:
        return "Không tìm thấy kết quả nào phù hợp trong kho dữ liệu."
    parts = []
    for c in chunks:
        label = f"{c.doc_title} (doc_id: {c.doc_id})"
        if c.article_number is not None:
            label += f", Điều {c.article_number}"
        if c.trimmed_to_khoan is not None:
            label += f", Khoản {c.trimmed_to_khoan}"
        if c.needs_review:
            label += " [OCR CHƯA XÁC MINH]"
        parts.append(f"{label}:\n{c.text}")
    return "\n\n".join(parts)


@tool
def get_fine_range(doc_id: str, dieu_number: int, khoan_number: Optional[int] = None) -> str:
    """Lấy mức phạt tiền (số tiền tối thiểu/tối đa, đơn vị đồng) ĐÃ ĐƯỢC TRÍCH XUẤT SẴN Ở DẠNG SỐ cho
    một khoản cụ thể, hoặc toàn bộ các khoản có mức phạt của một Điều nếu không truyền khoan_number.
    Dùng để ĐỐI CHIẾU con số bạn định viết vào câu trả lời trước khi chốt, đặc biệt với Điều có nhiều
    khoản/hành vi dễ nhầm lẫn — KHÔNG dùng để thay thế việc đọc và trích dẫn câu văn gốc (vẫn phải nêu
    rõ hành vi vi phạm tương ứng lấy từ get_article/get_khoan hoặc Ngữ cảnh), chỉ dùng để xác thực số
    tiền đã đọc có đúng không.
    """
    by_article, doc_titles = _build_lookup_index()
    entry = by_article.get((doc_id, dieu_number))
    if entry is None:
        title = doc_titles.get(doc_id, doc_id)
        return f"Không tìm thấy Điều {dieu_number} trong văn bản '{title}' (doc_id: {doc_id})."

    def _fine_line(label: str, chunk: ArticleChunk) -> Optional[str]:
        if chunk.fine_min is None and chunk.fine_max is None:
            return None
        lo = _format_vnd(chunk.fine_min) if chunk.fine_min is not None else "?"
        hi = _format_vnd(chunk.fine_max) if chunk.fine_max is not None else "?"
        return f"{label}: phạt tiền từ {lo} đến {hi} đồng."

    if khoan_number is not None:
        chunk = entry["khoan"].get(khoan_number)
        if chunk is None:
            return f"Không tìm thấy Khoản {khoan_number} của Điều {dieu_number} trong văn bản '{doc_id}'."
        if chunk == "ambiguous":
            return (
                f"Dữ liệu mức phạt cho Khoản {khoan_number} Điều {dieu_number} (doc_id: {doc_id}) hiện "
                f"không rõ ràng trong kho dữ liệu (lỗi trích xuất đã biết). Không dùng số liệu ở đây — "
                f"đọc trực tiếp Điều này qua get_article và đối chiếu văn bản gốc."
            )
        line = _fine_line(f"Khoản {khoan_number} Điều {dieu_number}", chunk)
        return line or (
            f"Khoản {khoan_number} Điều {dieu_number} không quy định một mức phạt tiền cụ thể "
            f"(có thể là hình phạt bổ sung, biện pháp khắc phục hậu quả, hoặc điều khoản tham chiếu)."
        )

    lines = [
        line
        for kn, kc in sorted(entry["khoan"].items())
        if kc != "ambiguous" and (line := _fine_line(f"Khoản {kn}", kc)) is not None
    ]
    if not lines and entry["article"] is not None:
        article_line = _fine_line(f"Điều {dieu_number}", entry["article"])
        if article_line:
            lines.append(article_line)
    if not lines:
        return f"Điều {dieu_number} (doc_id: {doc_id}) không có khoản nào quy định mức phạt tiền cụ thể."
    return f"Mức phạt theo từng khoản của Điều {dieu_number} (doc_id: {doc_id}):\n" + "\n".join(lines)


TOOLS = [get_article, get_khoan, search_corpus, get_fine_range]
