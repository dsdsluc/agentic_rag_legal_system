from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langsmith import traceable

from .generate import AnswerMode, AnswerResult, answer_question

load_dotenv()

JUDGE_MODEL = "gpt-4o-mini"
DATASET_PATH = Path("data/eval/qa_set.json")

# ragas>=0.1.0 (requirements.txt) currently fails to import in this
# environment — it hard-imports langchain_community.chat_models.vertexai,
# which langchain-community 0.4.x no longer ships (moved to a standalone
# integration package), and downgrading langchain-community to chase that
# risks destabilizing the working generation pipeline. This is a small
# LLM-as-judge substitute covering the same two core signals (faithfulness,
# correctness) until that upstream issue is resolved.
JUDGE_SYSTEM_PROMPT = """Bạn là giám khảo đánh giá chất lượng câu trả lời của một hệ thống hỏi đáp \
pháp luật giao thông đường bộ Việt Nam. Với mỗi câu hỏi, bạn nhận được: ngữ cảnh đã truy xuất, câu \
trả lời của hệ thống, và câu trả lời tham chiếu (đáp án đúng, chỉ dùng để đối chiếu ý nghĩa, không \
yêu cầu khớp từng chữ).

Chấm hai tiêu chí, mỗi tiêu chí từ 1 đến 5:
- faithfulness: câu trả lời có được suy ra hoàn toàn từ ngữ cảnh đã cho hay không (5 = hoàn toàn có \
căn cứ, không bịa thông tin; 1 = bịa đặt hoặc mâu thuẫn với ngữ cảnh).
- correctness: câu trả lời có đúng nội dung so với câu trả lời tham chiếu hay không (5 = đúng và đầy \
đủ; 1 = sai hoặc thiếu nội dung quan trọng).

Trả lời DUY NHẤT một JSON hợp lệ, không kèm markdown, theo định dạng:
{"faithfulness": <1-5>, "correctness": <1-5>, "reasoning": "<giải thích ngắn gọn>"}"""

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


@dataclass
class EvalCase:
    question: str
    reference_answer: str
    tags: list[str] = field(default_factory=list)
    mode: AnswerMode = "professional"
    use_graph_expansion: bool = False
    trim_context: bool = True
    use_tools: bool = True
    use_reflection: bool = True


@dataclass
class EvalResult:
    case: EvalCase
    answer: str
    faithfulness: int
    correctness: int
    reasoning: str
    source_ids: list[str] = field(default_factory=list)
    latency_seconds: float = 0.0
    context_chars: int = 0


def load_eval_set(path: Path = DATASET_PATH) -> list[EvalCase]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return [EvalCase(**item) for item in data]


@traceable(name="eval_judge", run_type="chain")
def _judge(case: EvalCase, result: AnswerResult) -> dict:
    context = "\n\n".join(f"[{i}] {c.text}" for i, c in enumerate(result.sources, start=1))
    llm = ChatOpenAI(model=JUDGE_MODEL, temperature=0, max_tokens=300, timeout=30, max_retries=2)
    messages = [
        SystemMessage(content=JUDGE_SYSTEM_PROMPT),
        HumanMessage(
            content=(
                f"Câu hỏi: {case.question}\n\n"
                f"Ngữ cảnh đã truy xuất:\n{context}\n\n"
                f"Câu trả lời của hệ thống: {result.answer}\n\n"
                f"Câu trả lời tham chiếu: {case.reference_answer}"
            )
        ),
    ]
    response = llm.invoke(messages)
    raw = _JSON_FENCE_RE.sub("", response.content).strip()
    return json.loads(raw)


@traceable(name="run_eval", run_type="chain")
def run_eval(path: Path = DATASET_PATH) -> list[EvalResult]:
    results = []
    for case in load_eval_set(path):
        t0 = time.perf_counter()
        answer_result = answer_question(
            case.question,
            mode=case.mode,
            use_graph_expansion=case.use_graph_expansion,
            trim_context=case.trim_context,
            use_tools=case.use_tools,
            use_reflection=case.use_reflection,
        )
        latency = time.perf_counter() - t0
        judged = _judge(case, answer_result)
        results.append(
            EvalResult(
                case=case,
                answer=answer_result.answer,
                faithfulness=judged["faithfulness"],
                correctness=judged["correctness"],
                reasoning=judged.get("reasoning", ""),
                source_ids=[c.chunk_id for c in answer_result.sources],
                latency_seconds=latency,
                context_chars=sum(len(c.text) for c in answer_result.sources),
            )
        )
    return results


def print_report(results: list[EvalResult]) -> None:
    if not results:
        print("No eval cases.")
        return
    avg_f = sum(r.faithfulness for r in results) / len(results)
    avg_c = sum(r.correctness for r in results) / len(results)
    avg_latency = sum(r.latency_seconds for r in results) / len(results)
    avg_context = sum(r.context_chars for r in results) / len(results)
    print(f"Eval cases: {len(results)}")
    print(f"Avg faithfulness: {avg_f:.2f}/5   Avg correctness: {avg_c:.2f}/5")
    print(f"Avg latency: {avg_latency:.2f}s   Avg context: {avg_context:.0f} chars\n")
    for r in results:
        flag = "OK" if r.faithfulness >= 4 and r.correctness >= 4 else "REVIEW"
        tags = f" {r.case.tags}" if r.case.tags else ""
        print(
            f"[{flag}] F={r.faithfulness} C={r.correctness} "
            f"lat={r.latency_seconds:.2f}s ctx={r.context_chars}c | {r.case.question}{tags}"
        )
        if flag == "REVIEW":
            print(f"    answer:    {r.answer}")
            print(f"    reference: {r.case.reference_answer}")
            print(f"    reasoning: {r.reasoning}")
            print(f"    sources:   {r.source_ids}")


if __name__ == "__main__":
    print_report(run_eval())
