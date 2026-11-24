from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel


class DocType(str, Enum):
    LUAT = "luat"
    NGHI_DINH = "nghi_dinh"
    THONG_TU = "thong_tu"
    # A Bộ luật (Civil Code, Penal Code, ...) is enacted by the National
    # Assembly like a Luật, but is a genuinely different scale/structure
    # (a comprehensive code, hundreds of Điều across many Chương/Mục) —
    # kept distinct rather than folded into LUAT so anything that branches
    # on doc_type later (admin UI grouping, future ingestion tuning) can
    # tell them apart. See architecture/strategy.txt.
    BO_LUAT = "bo_luat"


class Domain(str, Enum):
    """Lĩnh vực pháp luật — orthogonal to DocType (which is the FORM of a
    document — luật/nghị định/thông tư/bộ luật — not its subject area).
    Added when the corpus expanded beyond road-traffic law (see
    architecture/strategy.txt) — every chunk/document must have one,
    inferred from which top-level docs/ subfolder it lives under
    (metadata_parse.py), not left implicit like doc_type effectively was
    when only one domain existed."""

    GIAO_THONG = "giao_thong"
    DAN_SU = "dan_su"
    HINH_SU = "hinh_su"


class DocumentMetadata(BaseModel):
    doc_id: str
    title: str
    doc_type: DocType
    domain: Domain
    doc_number: str
    description: str
    source: str
    files: list[str]
    effective_date: Optional[date] = None
    folder_path: str


class ArticleChunk(BaseModel):
    chunk_id: str
    doc_id: str
    doc_type: DocType
    domain: Domain
    doc_title: str
    article_number: Optional[int] = None
    article_heading: Optional[str] = None
    text: str
    source_file: str
    # "subchunk" is never written to corpus.jsonl — it's a retrieval unit
    # (a khoản / điểm-group / window of a long Điều) built at index time by
    # retrieval_units.py, see there.
    chunk_type: Literal["article", "annex", "preamble", "template", "khoan", "subchunk"]
    needs_review: bool = False
    ocr_confidence: Optional[float] = None
    embedding_text: Optional[str] = None
    khoan_number: Optional[int] = None
    parent_chunk_id: Optional[str] = None
    # Mức phạt tiền (VNĐ) trích xuất từ text, nếu khoản/Điều này nêu một mức
    # phạt cụ thể — None nếu không xác định được hoặc khoản này không nêu số
    # tiền (ví dụ chỉ là hình phạt bổ sung, hoặc tham chiếu sang khoản khác).
    fine_min: Optional[int] = None
    fine_max: Optional[int] = None


class RelationEdge(BaseModel):
    from_doc_id: str
    relation_type: str
    to_doc_text: str
    to_doc_id: Optional[str] = None


class KhoanRelation(BaseModel):
    """A khoản-level amendment edge: `from_chunk_id` (in a document already
    known — via RelationEdge — to amend `to_doc_id`) modifies/repeals/adds
    the khoản identified by `to_article_number`/`to_khoan_label`. Separate
    from RelationEdge (which stays document-level, hand-authored via
    meta_data.txt) rather than folded into it — this is a different
    granularity, auto-derived from the amending document's own text, and
    keeping the two apart avoids retrofitting every RelationEdge consumer
    (graph.py) to filter chunk-scoped rows out of doc-scoped traversal."""

    from_chunk_id: str
    from_doc_id: str
    to_doc_id: str
    to_article_number: Optional[int] = None
    # Khoản labels in source law aren't always plain integers — an inserted
    # clause is often numbered "8a", "9a" (khoản 8a "bổ sung ... vào sau
    # khoản 8") — kept as the literal label string rather than int so a
    # genuinely new khoản doesn't get coerced into colliding with khoản 8.
    to_khoan_label: Optional[str] = None
    to_chunk_id: Optional[str] = None
    relation_type: str
    resolved: bool = False
    note: Optional[str] = None
