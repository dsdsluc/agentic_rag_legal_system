"""rag/generation/generate.py — the citizen-mode cross-reference mask (Plan C,
plans/plan.txt 2026-08-25) and per-mode max_tokens. Pure logic, no LLM
call needed."""

from rag.generation.generate import CITIZEN_MAX_TOKENS, PROFESSIONAL_MAX_TOKENS, _mask_citizen_cross_refs, _max_tokens_for


def test_mask_strips_multi_number_cross_reference():
    text = (
        "b) Đã bị kết án về tội này hoặc về một trong các tội quy định tại các điều "
        "168, 169, 170, 171, 172, 174, 175 và 290 của Bộ luật này, chưa được xóa án "
        "tích mà còn vi phạm;"
    )
    result = _mask_citizen_cross_refs(text)
    assert "168" not in result
    assert "quy định liên quan khác" in result
    # No dangling fragment from the clause that followed the citation.
    assert "chưa được xóa án tích mà còn vi phạm;" in result


def test_mask_leaves_ordinary_single_reference_untouched():
    # "quy định tại Điều 13 của Luật này" — a normal single cross-reference,
    # not the confusing multi-number list this targets. Must not be masked.
    text = "áp dụng quy tắc sử dụng làn đường quy định tại Điều 13 của Luật này."
    assert _mask_citizen_cross_refs(text) == text


def test_mask_leaves_text_without_cross_reference_untouched():
    text = "Người điều khiển xe máy vượt đèn đỏ bị phạt từ 4.000.000 đến 6.000.000 đồng."
    assert _mask_citizen_cross_refs(text) == text


def test_max_tokens_professional_higher_than_citizen():
    assert _max_tokens_for("citizen") == CITIZEN_MAX_TOKENS
    assert _max_tokens_for("professional") == PROFESSIONAL_MAX_TOKENS
    assert PROFESSIONAL_MAX_TOKENS > CITIZEN_MAX_TOKENS
