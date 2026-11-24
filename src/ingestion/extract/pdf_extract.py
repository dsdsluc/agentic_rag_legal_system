from __future__ import annotations

import io
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import pymupdf

from ingestion.extract.text_clean import clean_page_text

TEXT_LAYER_MIN_CHARS = 20
OCR_LANG = "vie"
OCR_DPI = 300
OCR_CONFIDENCE_THRESHOLD = 70.0

# Vietnamese government PDFs embed a digital-signature metadata block
# ("Ký bởi:"/"Người ký: ...\nEmail: ...\nCơ quan: ...\nThời gian ký: ...")
# as real, selectable text — even when the page underneath it is a pure
# scanned image with no other text layer at all. Found via a real pilot
# ingestion (Luật 12/2017/QH14): this block alone is >= TEXT_LAYER_MIN_CHARS,
# so extract_page() decided the page "has a text layer" and skipped OCR
# entirely — silently losing that page's actual scanned content (in that
# case, the "Điều 1." heading itself, so the whole article merged into
# "preamble" unflagged). Detected by the "Thời gian ký:" line, which only
# ever appears in this metadata block, never in real legal body text.
_SIGNATURE_METADATA_RE = re.compile(r"Thời gian ký\s*:", re.IGNORECASE)
# A real page of body text runs well into the thousands of characters; the
# signature block itself is a few hundred at most. Only treat native text
# as "not real content" when it's short AND carries the signature marker —
# a page that has genuine paragraphs *and* happens to include the marker
# (e.g. the signature appears after real closing text) should still use its
# native text layer, not be forced through OCR for no reason.
_SIGNATURE_ONLY_MAX_CHARS = 500

# Tesseract isn't on PATH in this environment (installed without admin rights
# to update the system PATH), and its bundled tessdata has no Vietnamese pack
# — point pytesseract at the local install and a project-local tessdata dir
# holding vie.traineddata instead of relying on defaults.
TESSERACT_CMD = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
TESSDATA_DIR = Path(__file__).resolve().parents[3] / "tessdata"
TESSERACT_CONFIG = f"--tessdata-dir {TESSDATA_DIR}"


def _configure_pytesseract() -> None:
    import pytesseract

    if Path(TESSERACT_CMD).exists():
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD


@dataclass
class PageExtraction:
    text: str
    used_ocr: bool
    ocr_confidence: float | None


@dataclass
class PageRecord:
    source_file: str
    page_index: int
    text: str
    used_ocr: bool
    ocr_confidence: float | None
    start_offset: int
    end_offset: int


@dataclass
class DocumentText:
    text: str
    pages: list[PageRecord]


@lru_cache(maxsize=1)
def tesseract_available() -> bool:
    try:
        import pytesseract

        _configure_pytesseract()
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def _ocr_page(page: "pymupdf.Page") -> PageExtraction:
    if not tesseract_available():
        return PageExtraction(text="", used_ocr=True, ocr_confidence=None)

    import pytesseract
    from PIL import Image

    _configure_pytesseract()
    pix = page.get_pixmap(dpi=OCR_DPI)
    image = Image.open(io.BytesIO(pix.tobytes("png")))
    data = pytesseract.image_to_data(
        image,
        lang=OCR_LANG,
        config=TESSERACT_CONFIG,
        output_type=pytesseract.Output.DICT,
    )

    # Group words back into lines using Tesseract's own line segmentation
    # (block/par/line numbers) rather than joining every word on the page
    # into one string — flattening line breaks would break the "^Điều N."
    # start-of-line boundary regex that article_split.py relies on.
    lines: dict[tuple[int, int, int], list[str]] = {}
    line_order: list[tuple[int, int, int]] = []
    confidences: list[float] = []
    for i, word in enumerate(data["text"]):
        word = word.strip()
        if not word:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        if key not in lines:
            lines[key] = []
            line_order.append(key)
        lines[key].append(word)
        try:
            conf_val = float(data["conf"][i])
        except (TypeError, ValueError):
            continue
        if conf_val >= 0:
            confidences.append(conf_val)

    text = "\n".join(" ".join(lines[key]) for key in line_order)
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
    return PageExtraction(text=text, used_ocr=True, ocr_confidence=avg_conf)


def extract_page(page: "pymupdf.Page") -> PageExtraction:
    native_text = page.get_text()
    stripped = native_text.strip()
    looks_like_signature_only = len(stripped) <= _SIGNATURE_ONLY_MAX_CHARS and _SIGNATURE_METADATA_RE.search(
        stripped
    )
    if len(stripped) >= TEXT_LAYER_MIN_CHARS and not looks_like_signature_only:
        return PageExtraction(text=native_text, used_ocr=False, ocr_confidence=None)
    return _ocr_page(page)


def extract_pdf_pages(path: Path) -> list[PageExtraction]:
    doc = pymupdf.open(path)
    try:
        pages = [extract_page(doc[i]) for i in range(doc.page_count)]
    finally:
        doc.close()
    for page in pages:
        page.text = clean_page_text(page.text)
    return pages


def build_document_text(folder_path: Path, filenames: list[str]) -> DocumentText:
    """Concatenate the given files' pages, in order, into one text blob,
    tracking which (source_file, page_index) each character range came from
    so chunks can later be attributed back to a source file/page."""
    parts: list[str] = []
    pages: list[PageRecord] = []
    offset = 0
    for filename in filenames:
        path = folder_path / filename
        for page_index, extraction in enumerate(extract_pdf_pages(path)):
            page_text = extraction.text
            start = offset
            parts.append(page_text)
            offset += len(page_text) + 1  # +1 accounts for the joining "\n"
            end = offset - 1
            pages.append(
                PageRecord(
                    source_file=filename,
                    page_index=page_index,
                    text=page_text,
                    used_ocr=extraction.used_ocr,
                    ocr_confidence=extraction.ocr_confidence,
                    start_offset=start,
                    end_offset=end,
                )
            )
    return DocumentText(text="\n".join(parts), pages=pages)


def find_page_for_offset(pages: list[PageRecord], offset: int) -> PageRecord | None:
    for page in pages:
        if page.start_offset <= offset <= page.end_offset:
            return page
    return pages[-1] if pages else None
