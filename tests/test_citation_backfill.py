"""rag/generation/generate.py::_backfill_citation_markers — deterministic safety net for
the professional-mode "[n] (Tên văn bản, Điều X)" citation shape that
web/components/AnswerText.tsx requires to turn a citation into a Legal
Workspace link. Added because both the initial generation prompt and a
dedicated reflection-pass addendum proved unreliable on real dân sự/hình sự
answers (verified live, 2026-08-26): the model produced a correct
"(Bộ luật Dân sự 91/2015/QH13, Điều 167)" citation with no "[n]" in front,
leaving it as inert plain text instead of a link. Pure logic, no LLM call."""

from rag.generation.generate import _backfill_citation_markers
from rag.retrieval.retriever import RetrievedChunk


def _chunk(doc_title: str, article_number: int) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=f"{doc_title}::dieu_{article_number}",
        text="",
        doc_id=doc_title,
        doc_type="bo_luat",
        doc_title=doc_title,
        article_number=article_number,
        article_heading="",
        chunk_type="dieu",
        needs_review=False,
        source_file="",
    )


def test_inserts_marker_when_doc_title_and_article_match():
    chunks = [_chunk("Bộ luật Dân sự 91/2015/QH13", 469), _chunk("Bộ luật Dân sự 91/2015/QH13", 167)]
    answer = "Bên cho vay có quyền đòi lại tài sản (Bộ luật Dân sự 91/2015/QH13, Điều 469)."
    result = _backfill_citation_markers(answer, chunks)
    assert result == "Bên cho vay có quyền đòi lại tài sản [1] (Bộ luật Dân sự 91/2015/QH13, Điều 469)."


def test_falls_back_to_article_number_when_doc_title_omitted():
    # A shortened repeat citation later in the same answer, once the văn
    # bản name was already stated earlier in prose — real case observed
    # live. Still unambiguous here since only one retrieved chunk has
    # article_number=469.
    chunks = [
        _chunk("Bộ luật Dân sự 91/2015/QH13", 469),
        _chunk("Bộ luật Dân sự 91/2015/QH13", 470),
    ]
    answer = "... được trả lãi đến thời điểm nhận lại tài sản (Điều 469, Khoản 1 và 2)."
    result = _backfill_citation_markers(answer, chunks)
    assert result == "... được trả lãi đến thời điểm nhận lại tài sản [1] (Điều 469, Khoản 1 và 2)."


def test_does_not_duplicate_marker_already_present():
    chunks = [_chunk("Nghị định 168/2024/NĐ-CP", 6)]
    answer = "Phạt tiền từ 400.000 đến 600.000 đồng [1] (Nghị định 168/2024/NĐ-CP, Điều 6, Khoản 1)."
    assert _backfill_citation_markers(answer, chunks) == answer


def test_skips_ambiguous_article_number_shared_by_multiple_docs():
    # Two different văn bản both happen to have an Điều 6 among the
    # retrieved chunks, and this citation omits the doc title — no way to
    # tell which one it means, so leave it untouched rather than guess.
    chunks = [_chunk("Nghị định 168/2024/NĐ-CP", 6), _chunk("Nghị định 151/2024/NĐ-CP", 6)]
    answer = "Mức phạt được quy định (Điều 6)."
    assert _backfill_citation_markers(answer, chunks) == answer


def test_leaves_non_legal_parenthetical_untouched():
    chunks = [_chunk("Bộ luật Dân sự 91/2015/QH13", 469)]
    answer = "Việc chứng minh hợp đồng vay không giấy tờ có thể gặp khó khăn (trên thực tế)."
    assert _backfill_citation_markers(answer, chunks) == answer


def test_empty_chunks_returns_answer_unchanged():
    answer = "Không tìm thấy quy định liên quan (Điều 5)."
    assert _backfill_citation_markers(answer, []) == answer
