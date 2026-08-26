"""rag/generate.py::_reflect — the post-draft self-check step. Uses a fake
LLM stub (no OpenAI call) so these run in the fast pytest suite; the actual
prompt/model behavior was verified live via eval.py (see plans/plan_2.txt —
reflection section) and caught a real bug this way: gpt-4o-mini sometimes
replied with meta-commentary about the draft ("câu trả lời nháp đã đúng và
đầy đủ.") instead of the answer itself, silently destroying a real 100-500+
char answer in 2/9 eval cases. These tests lock in the safety net added to
catch that specific failure mode without needing a live model each run."""

from rag.generate import _REFLECTION_AMBIGUOUS_VEHICLE_ADDENDUM, _REFLECTION_CITIZEN_ADDENDUM, _reflect


class _FakeResponse:
    def __init__(self, content: str):
        self.content = content


class _FakeLLM:
    def __init__(self, reply: str):
        self._reply = reply
        self.last_messages = None

    def invoke(self, messages):
        self.last_messages = messages
        return _FakeResponse(self._reply)


class _RaisingLLM:
    def invoke(self, messages):
        raise RuntimeError("simulated OpenAI failure")


DRAFT = (
    "Mức phạt là từ 400.000 đồng đến 600.000 đồng [1] (Nghị định 168/2024/NĐ-CP, "
    "Điều 6, Khoản 1, Điểm a) đối với hành vi không chấp hành hiệu lệnh biển báo hiệu."
)


def test_reflect_returns_corrected_answer_when_reasonable_length():
    corrected = (
        "Mức phạt là từ 4.000.000 đồng đến 6.000.000 đồng [1] (Nghị định 168/2024/NĐ-CP, "
        "Điều 6, Khoản 5, Điểm a) đối với hành vi không chấp hành hiệu lệnh biển báo hiệu."
    )
    result = _reflect(_FakeLLM(corrected), "Ngữ cảnh: ...", DRAFT, "professional")
    assert result == corrected


def test_reflect_returns_verbatim_copy_when_draft_already_correct():
    result = _reflect(_FakeLLM(DRAFT), "Ngữ cảnh: ...", DRAFT, "professional")
    assert result == DRAFT


def test_reflect_falls_back_to_draft_on_meta_commentary_by_marker():
    # The actual failure observed in eval: a short meta-comment about the
    # draft instead of reproducing/fixing it.
    result = _reflect(_FakeLLM("Câu trả lời nháp đã đúng và đầy đủ."), "Ngữ cảnh: ...", DRAFT, "professional")
    assert result == DRAFT


def test_reflect_falls_back_to_draft_on_disproportionately_short_reply():
    # No marker phrase, but still far too short to be a real corrected
    # answer for a 100+ char draft — same safety net catches this too.
    result = _reflect(_FakeLLM("OK."), "Ngữ cảnh: ...", DRAFT, "professional")
    assert result == DRAFT


def test_reflect_falls_back_to_draft_on_llm_error():
    result = _reflect(_RaisingLLM(), "Ngữ cảnh: ...", DRAFT, "professional")
    assert result == DRAFT


def test_reflect_falls_back_to_draft_on_empty_reply():
    result = _reflect(_FakeLLM(""), "Ngữ cảnh: ...", DRAFT, "professional")
    assert result == DRAFT


def test_reflect_short_draft_not_penalized_by_length_ratio():
    # The length-ratio guard only applies when the draft itself is long
    # enough (>60 chars) that a short reply is suspicious — a short draft
    # legitimately corrected into an even shorter one shouldn't trip it.
    short_draft = "Không tìm thấy quy định liên quan."
    result = _reflect(_FakeLLM("Không rõ."), "Ngữ cảnh: ...", short_draft, "professional")
    assert result == "Không rõ."


def test_reflect_includes_citizen_addendum_only_for_citizen_mode():
    citizen_llm = _FakeLLM(DRAFT)
    _reflect(citizen_llm, "Ngữ cảnh: ...", DRAFT, "citizen")
    system_prompt = citizen_llm.last_messages[0].content
    assert _REFLECTION_CITIZEN_ADDENDUM in system_prompt

    professional_llm = _FakeLLM(DRAFT)
    _reflect(professional_llm, "Ngữ cảnh: ...", DRAFT, "professional")
    system_prompt = professional_llm.last_messages[0].content
    assert _REFLECTION_CITIZEN_ADDENDUM not in system_prompt


def test_reflect_includes_ambiguous_vehicle_addendum_only_when_flagged():
    ambiguous_llm = _FakeLLM(DRAFT)
    _reflect(ambiguous_llm, "Ngữ cảnh: ...", DRAFT, "professional", vehicle_type_ambiguous=True)
    system_prompt = ambiguous_llm.last_messages[0].content
    assert _REFLECTION_AMBIGUOUS_VEHICLE_ADDENDUM in system_prompt

    unambiguous_llm = _FakeLLM(DRAFT)
    _reflect(unambiguous_llm, "Ngữ cảnh: ...", DRAFT, "professional", vehicle_type_ambiguous=False)
    system_prompt = unambiguous_llm.last_messages[0].content
    assert _REFLECTION_AMBIGUOUS_VEHICLE_ADDENDUM not in system_prompt


def test_reflect_can_combine_citizen_and_ambiguous_vehicle_addenda():
    llm = _FakeLLM(DRAFT)
    _reflect(llm, "Ngữ cảnh: ...", DRAFT, "citizen", vehicle_type_ambiguous=True)
    system_prompt = llm.last_messages[0].content
    assert _REFLECTION_CITIZEN_ADDENDUM in system_prompt
    assert _REFLECTION_AMBIGUOUS_VEHICLE_ADDENDUM in system_prompt
