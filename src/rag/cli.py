from __future__ import annotations

from .generate import answer_question


def main() -> None:
    print("Legal RAG query CLI. Nhập câu hỏi (tiếng Việt), hoặc 'exit' để thoát.")
    while True:
        question = input("\n> ").strip()
        if not question or question.lower() in {"exit", "quit"}:
            break
        result = answer_question(question)
        if result.intent:
            i = result.intent
            print(
                f"[intent] violation={i.violation!r} vehicle_type={i.vehicle_type!r} "
                f"info_need={i.info_need!r} ambiguous={i.vehicle_type_ambiguous}"
            )
        print(f"\n{result.answer}\n")
        print("Nguồn:")
        for i, chunk in enumerate(result.sources, start=1):
            label = chunk.doc_title
            if chunk.article_number is not None:
                label += f", Điều {chunk.article_number}"
            flags = []
            if chunk.needs_review:
                flags.append("needs_review")
            if chunk.is_amendment_context:
                flags.append(f"amends_context_for={chunk.amends_doc_id}")
            flag_str = f" [{', '.join(flags)}]" if flags else ""
            print(
                f"  [{i}] {label} (score={chunk.score:.4f}, dense_rank={chunk.dense_rank}, "
                f"bm25_rank={chunk.bm25_rank}){flag_str}"
            )


if __name__ == "__main__":
    main()
