from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

import tiktoken

from ingestion.models import ArticleChunk, DocumentMetadata
from ingestion.extract.pdf_extract import (
    OCR_CONFIDENCE_THRESHOLD,
    DocumentText,
    build_document_text,
    find_page_for_offset,
)

ANNEX_FILE_RE = re.compile(r"(-pl\d*|-kem)(\.pdf)?$", re.IGNORECASE)
# Leading `[.\-–—•·\s]{0,3}` tolerates a small amount of OCR noise before
# "Điều" at the start of a line — found via a real pilot ingestion (Luật
# 12/2017/QH14): Tesseract occasionally renders a decorative leading mark
# (a bullet/dash in the source, or a stray artifact) as a literal "." right
# before the heading (observed: ".Điều 1. Sửa đổi, bổ sung..."), which the
# old strict `^Điều` anchor never matched — silently losing the ENTIRE
# first article's content into the "preamble" chunk (see
# PREAMBLE_MAX_PLAUSIBLE_CHARS below, added as a safety net for the same
# failure. Capped at 3 chars so this can't start matching "Điều" embedded
# mid-sentence — those never sit at a true line start regardless of noise.
ARTICLE_RE = re.compile(r"^[.\-–—•·\s]{0,3}Điều\s+(\d+)\.\s*(.*)$", re.MULTILINE)

ANNEX_CHUNK_TOKENS = 500
ANNEX_CHUNK_OVERLAP = 50
_ENCODING = tiktoken.get_encoding("cl100k_base")

# A genuine preamble (org header + "Căn cứ..." recitals + "QUỐC HỘI... BAN
# HÀNH:") is a few hundred to low-thousands of chars. Found via a real
# pilot ingestion (Luật 12/2017/QH14): when "Điều 1." itself fails to match
# ARTICLE_RE (OCR garbled the heading beyond recognition — same root cause
# as the has_gap_after case below, just with no *previous* match to compare
# against, so that check can't catch it), the ENTIRE first article's
# content — which can be huge — silently lands in "preamble" instead,
# unflagged (observed: a 255,613-char preamble swallowing all of Điều 1 in
# that document, which itself listed dozens of amendments). A preamble this
# size is never legitimate; flag it so it surfaces in Rà soát OCR instead
# of silently shipping a near-quarter-million-character unretrievable chunk.
PREAMBLE_MAX_PLAUSIBLE_CHARS = 3000


def classify_files(files: list[str]) -> tuple[list[str], list[str]]:
    """Split a document's file list into (main_sequence_files, annex_files).

    Annex/attachment files (Phụ lục "-plN", attachment "-kem") are not part
    of the Điều numbering sequence and are chunked separately; everything
    else (including "_tiep" continuation parts) is concatenated in the
    order listed and treated as one continuous Điều sequence.
    """
    main_files, annex_files = [], []
    for filename in files:
        (annex_files if ANNEX_FILE_RE.search(filename) else main_files).append(filename)
    return main_files, annex_files


def _page_needs_review(page) -> bool:
    return page is not None and page.ocr_confidence is not None and page.ocr_confidence < OCR_CONFIDENCE_THRESHOLD


def _token_window_chunks(
    meta: DocumentMetadata,
    text: str,
    chunk_id_prefix: str,
    source_file: str,
    needs_review: bool,
    ocr_confidence: Optional[float],
    chunk_type: str = "annex",
) -> list[ArticleChunk]:
    tokens = _ENCODING.encode(text)
    if not tokens:
        return []

    chunks: list[ArticleChunk] = []
    step = ANNEX_CHUNK_TOKENS - ANNEX_CHUNK_OVERLAP
    for i, start in enumerate(range(0, len(tokens), step)):
        window = tokens[start : start + ANNEX_CHUNK_TOKENS]
        chunk_text = _ENCODING.decode(window).strip()
        if chunk_text:
            chunks.append(
                ArticleChunk(
                    chunk_id=f"{chunk_id_prefix}_{i}",
                    doc_id=meta.doc_id,
                    doc_type=meta.doc_type,
                    domain=meta.domain,
                    doc_title=meta.title,
                    text=chunk_text,
                    source_file=source_file,
                    chunk_type=chunk_type,
                    needs_review=needs_review,
                    ocr_confidence=ocr_confidence,
                )
            )
        if start + ANNEX_CHUNK_TOKENS >= len(tokens):
            break
    return chunks


def split_main_sequence(meta: DocumentMetadata, doc_text: DocumentText) -> list[ArticleChunk]:
    text = doc_text.text
    all_matches = list(ARTICLE_RE.finditer(text))
    chunks: list[ArticleChunk] = []

    # Article numbers in a genuine Điều sequence strictly increase. Some
    # decree PDFs append administrative form templates ("Mẫu Quyết định...")
    # after the real content, in the same file, and those templates restart
    # their own local "Điều 1, 2, 3" numbering (observed in ND_241_2026) —
    # matching that as more decree articles both misrepresents it and
    # collides chunk_ids with the real Điều 1/2/3. Stop the article sequence
    # at the first non-increasing match and fold everything from there to the
    # end into token-windowed "template" chunks instead — tagged distinctly
    # from "annex" (a real Phụ lục with actual legal content, e.g. a fine
    # schedule) since these are blank fill-in-the-blank forms whose generic
    # boilerplate ("có hiệu lực thi hành kể từ ngày ký") otherwise false-
    # matches unrelated effective-date queries; excluded from retrieval.
    matches = []
    tail_start: Optional[int] = None
    last_number = 0
    for match in all_matches:
        number = int(match.group(1))
        if number <= last_number:
            tail_start = match.start()
            break
        matches.append(match)
        last_number = number

    if matches:
        preamble_end = matches[0].start()
    elif tail_start is not None:
        preamble_end = tail_start
    else:
        preamble_end = len(text)

    preamble_text = text[:preamble_end].strip()
    if preamble_text:
        page = find_page_for_offset(doc_text.pages, 0)
        chunks.append(
            ArticleChunk(
                chunk_id=f"{meta.doc_id}::preamble",
                doc_id=meta.doc_id,
                doc_type=meta.doc_type,
                domain=meta.domain,
                doc_title=meta.title,
                text=preamble_text,
                source_file=page.source_file if page else (meta.files[0] if meta.files else ""),
                chunk_type="preamble",
                needs_review=_page_needs_review(page) or len(preamble_text) > PREAMBLE_MAX_PLAUSIBLE_CHARS,
                ocr_confidence=page.ocr_confidence if page else None,
            )
        )

    for i, match in enumerate(matches):
        start = match.start()
        if i + 1 < len(matches):
            end = matches[i + 1].start()
        elif tail_start is not None:
            end = tail_start
        else:
            end = len(text)
        article_number = int(match.group(1))
        heading = match.group(2).strip() or None
        page = find_page_for_offset(doc_text.pages, start)

        # Điều numbering is strictly sequential in the source document, so a
        # skip to the next matched number (e.g. 6 then 8) means a heading in
        # between was missed — observed cause: OCR dropping just the word
        # "Điều" from a line (e.g. rendering "Điều 7." as " 7."), so the
        # regex never matches it and its text silently lands in this chunk
        # instead of its own. Flag for review rather than guess a split.
        next_number = int(matches[i + 1].group(1)) if i + 1 < len(matches) else None
        has_gap_after = next_number is not None and next_number > article_number + 1

        chunks.append(
            ArticleChunk(
                chunk_id=f"{meta.doc_id}::dieu_{article_number}",
                doc_id=meta.doc_id,
                doc_type=meta.doc_type,
                domain=meta.domain,
                doc_title=meta.title,
                article_number=article_number,
                article_heading=heading,
                text=text[start:end].strip(),
                source_file=page.source_file if page else "",
                chunk_type="article",
                needs_review=_page_needs_review(page) or has_gap_after,
                ocr_confidence=page.ocr_confidence if page else None,
            )
        )

    if tail_start is not None:
        page = find_page_for_offset(doc_text.pages, tail_start)
        chunks.extend(
            _token_window_chunks(
                meta,
                text[tail_start:],
                f"{meta.doc_id}::template",
                page.source_file if page else (meta.files[-1] if meta.files else ""),
                _page_needs_review(page),
                page.ocr_confidence if page else None,
                chunk_type="template",
            )
        )

    return chunks


def split_annex_file(meta: DocumentMetadata, folder_path: Path, filename: str) -> list[ArticleChunk]:
    doc_text = build_document_text(folder_path, [filename])

    any_ocr_low_conf = any(
        page.ocr_confidence is not None and page.ocr_confidence < OCR_CONFIDENCE_THRESHOLD
        for page in doc_text.pages
    )
    ocr_confidences = [p.ocr_confidence for p in doc_text.pages if p.ocr_confidence is not None]
    min_confidence = min(ocr_confidences) if ocr_confidences else None

    stem = Path(filename).stem
    return _token_window_chunks(
        meta,
        doc_text.text,
        f"{meta.doc_id}::annex_{stem}",
        filename,
        any_ocr_low_conf,
        min_confidence,
    )


def build_chunks(meta: DocumentMetadata) -> list[ArticleChunk]:
    folder_path = Path(meta.folder_path)
    main_files, annex_files = classify_files(meta.files)

    chunks: list[ArticleChunk] = []
    if main_files:
        doc_text = build_document_text(folder_path, main_files)
        chunks.extend(split_main_sequence(meta, doc_text))
    for filename in annex_files:
        chunks.extend(split_annex_file(meta, folder_path, filename))
    return chunks
