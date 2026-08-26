"""get_article/get_khoan (rag/tools.py) — pure lookups against the cached
corpus, no LLM call. See plans/plan_2.txt Giai đoạn 1: these are the tools
the generation agent calls to resolve a cross-reference ("theo khoản 3
Điều 5") that isn't already in the retrieved context, instead of guessing
or refusing. Verified end-to-end against a live agent run (Điều 12 Khoản 3
of ND_336_2025) before these were written; these tests lock that lookup
behavior in without needing an OpenAI call."""

import rag.tools as tools_module
from ingestion.models import ArticleChunk, DocType, Domain
from rag.tools import get_article, get_fine_range, get_khoan


def _fake_chunk(**overrides) -> ArticleChunk:
    base = dict(
        chunk_id="FAKE_DOC::dieu_1::khoan_1",
        doc_id="FAKE_DOC",
        doc_type=DocType.NGHI_DINH,
        domain=Domain.GIAO_THONG,
        doc_title="Fake Document",
        article_number=1,
        text="1. Placeholder text.",
        source_file="fake.pdf",
        chunk_type="khoan",
        khoan_number=1,
    )
    base.update(overrides)
    return ArticleChunk(**base)

# search_corpus is intentionally NOT covered here — it needs the local
# sentence-transformers embedding model loaded (~20s cold start), which
# would slow every pytest run for the whole repo. It was verified manually
# against the real corpus/agent instead (see plans/plan_2.txt Giai đoạn 2).


def test_get_article_returns_known_article():
    result = get_article.invoke({"doc_id": "ND_168_2024", "dieu_number": 6})
    assert "Điều 6" in result
    assert "ND_168_2024" not in result  # doc_title shown, not the raw doc_id
    assert "Nghị định 168" in result


def test_get_article_missing_dieu_reports_not_found():
    result = get_article.invoke({"doc_id": "ND_168_2024", "dieu_number": 99999})
    assert "Không tìm thấy" in result


def test_get_article_missing_doc_reports_not_found():
    result = get_article.invoke({"doc_id": "NOT_A_REAL_DOC", "dieu_number": 1})
    assert "Không tìm thấy" in result


def test_get_khoan_returns_known_khoan():
    result = get_khoan.invoke({"doc_id": "ND_336_2025", "dieu_number": 12, "khoan_number": 3})
    assert "Khoản 3" in result
    assert "bố trí người trực tiếp điều hành" in result


def test_get_khoan_missing_khoan_reports_not_found():
    result = get_khoan.invoke({"doc_id": "ND_168_2024", "dieu_number": 6, "khoan_number": 99999})
    assert "Không tìm thấy" in result


def test_get_khoan_missing_dieu_reports_not_found():
    result = get_khoan.invoke({"doc_id": "ND_168_2024", "dieu_number": 99999, "khoan_number": 1})
    assert "Không tìm thấy" in result


def test_get_khoan_ambiguous_duplicate_refuses_to_guess(monkeypatch):
    # The real corpus.jsonl duplicate-khoan examples previously used here
    # (ND_336_2025::dieu_19::khoan_2, ND_168_2024::dieu_37, then
    # ND_165_2024::dieu_16::khoan_2 — see plans/plan_2.txt §2.6) have each
    # in turn been fixed at the source, which silently broke this test
    # every time since the "ambiguous" condition (two same-key khoan chunks
    # with genuinely different text) no longer existed anywhere in the
    # corpus to exercise. Using a synthetic pair instead of a real corpus
    # example makes the test independent of future data cleanup.
    dupes = [
        _fake_chunk(chunk_id="FAKE_DOC::dieu_1::khoan_1", text="1. Version A."),
        _fake_chunk(chunk_id="FAKE_DOC::dieu_1::khoan_1", text="1. Version B (different)."),
    ]
    monkeypatch.setattr(tools_module, "load_corpus", lambda: dupes)
    tools_module._build_lookup_index.cache_clear()
    try:
        result = get_khoan.invoke({"doc_id": "FAKE_DOC", "dieu_number": 1, "khoan_number": 1})
        assert "không rõ ràng" in result
        assert "get_article" in result
    finally:
        tools_module._build_lookup_index.cache_clear()


def test_get_fine_range_ambiguous_duplicate_refuses_to_guess(monkeypatch):
    dupes = [
        _fake_chunk(chunk_id="FAKE_DOC::dieu_1::khoan_1", text="1. Phạt tiền từ 100.000 đến 200.000 đồng.", fine_min=100000, fine_max=200000),
        _fake_chunk(chunk_id="FAKE_DOC::dieu_1::khoan_1", text="1. Phạt tiền từ 300.000 đến 400.000 đồng.", fine_min=300000, fine_max=400000),
    ]
    monkeypatch.setattr(tools_module, "load_corpus", lambda: dupes)
    tools_module._build_lookup_index.cache_clear()
    try:
        result = get_fine_range.invoke({"doc_id": "FAKE_DOC", "dieu_number": 1, "khoan_number": 1})
        assert "không rõ ràng" in result
    finally:
        tools_module._build_lookup_index.cache_clear()


def test_get_fine_range_single_khoan():
    result = get_fine_range.invoke({"doc_id": "ND_168_2024", "dieu_number": 6, "khoan_number": 1})
    assert "400.000" in result
    assert "600.000" in result


def test_get_fine_range_whole_article_lists_every_khoan():
    result = get_fine_range.invoke({"doc_id": "ND_168_2024", "dieu_number": 6})
    assert "Khoản 1" in result
    assert "Khoản 13" in result


def test_get_fine_range_missing_khoan_reports_not_found():
    result = get_fine_range.invoke({"doc_id": "ND_168_2024", "dieu_number": 6, "khoan_number": 99999})
    assert "Không tìm thấy" in result


def test_get_fine_range_missing_dieu_reports_not_found():
    result = get_fine_range.invoke({"doc_id": "ND_168_2024", "dieu_number": 99999})
    assert "Không tìm thấy" in result
