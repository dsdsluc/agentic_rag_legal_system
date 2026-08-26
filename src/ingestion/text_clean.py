from __future__ import annotations

import re

SIGNATURE_LINE_RE = re.compile(
    r"^(Người ký|Email|Cơ quan(?: phát hành)?|Thời gian ký):.*$"
)
GAZETTE_HEADER_RE = re.compile(r"^CÔNG BÁO/Số.*$")
PAGE_NUMBER_LINE_RE = re.compile(r"^\d+$")


def clean_page_text(text: str) -> str:
    """Strip per-page noise (Công Báo gazette headers, digital-signature
    blocks, bare page-number lines) from one page's extracted text.

    Page-number stripping is restricted to lines near the very start/end of
    the page: a bare digit can also be a flattened table cell in the middle
    of a page's content (seen in Thông tư 17's embedded tables), and only
    header/footer position reliably distinguishes the two.
    """
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    n = len(lines)
    cleaned: list[str] = []
    for idx, line in enumerate(lines):
        if SIGNATURE_LINE_RE.match(line):
            continue
        if GAZETTE_HEADER_RE.match(line):
            continue
        near_boundary = idx <= 1 or idx >= n - 2
        if near_boundary and PAGE_NUMBER_LINE_RE.match(line):
            continue
        cleaned.append(line)
    return "\n".join(cleaned)
