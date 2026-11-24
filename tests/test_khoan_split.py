"""split_khoan is pure regex logic (no LLM, no I/O) shared by ingestion
(khoan_split.py) and query-time trimming (rag/retrieval/subchunk.py) — cheap to test
directly and catches boundary regressions before they silently corrupt
either path."""

from ingestion.chunking.khoan_split import split_khoan

ARTICLE_TEXT = """Điều 6. Xử phạt người điều khiển xe ô tô
1. Phạt tiền từ 400.000 đồng đến 600.000 đồng đối với hành vi A.
2. Phạt tiền từ 600.000 đồng đến 800.000 đồng đối với hành vi B.
3. Phạt tiền từ 800.000 đồng đến 1.000.000 đồng đối với hành vi C."""


def test_splits_into_expected_khoan_numbers():
    segments = split_khoan(ARTICLE_TEXT)
    assert [s.khoan_number for s in segments] == [1, 2, 3]


def test_khoan_text_does_not_include_heading():
    segments = split_khoan(ARTICLE_TEXT)
    assert "Điều 6" not in segments[0].text
    assert segments[0].text.startswith("1. Phạt tiền")


def test_last_khoan_runs_to_end_of_text():
    segments = split_khoan(ARTICLE_TEXT)
    assert segments[-1].text.endswith("hành vi C.")


def test_single_khoan_article_returns_empty():
    # split_khoan requires >= 2 matches to consider it a real khoản
    # structure — a single numbered line is ambiguous (could just be a
    # standalone numbered sentence), so callers keep the full text instead.
    text = "Điều 1. Chỉ có một đoạn.\n1. Nội dung duy nhất."
    assert split_khoan(text) == []


def test_no_khoan_structure_returns_empty():
    assert split_khoan("Điều 1. Không có khoản nào ở đây, chỉ là văn bản thường.") == []
