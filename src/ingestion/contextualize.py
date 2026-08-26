from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from .models import ArticleChunk, RelationEdge
from .relations import load_relations_file

load_dotenv()

CORPUS_PATH = Path("data/processed/corpus.jsonl")
RELATIONS_PATH = Path("data/processed/relations.json")
CONTEXT_MODEL = "gpt-4o-mini"
MAX_WORKERS = 8
TEXT_PREVIEW_CHARS = 600

# Anthropic's Contextual Retrieval technique: prepend a short LLM-generated
# blurb situating each chunk before it's embedded/indexed, so an amendment
# article or a short OCR'd decree clause isn't ambiguous once pulled out of
# its document. Grounded in our own parsed metadata/relations rather than
# an LLM re-reading the whole source document, since that data is already
# accurate — cheaper and less error-prone than re-deriving it.
SYSTEM_PROMPT = """Bạn tạo một câu ngữ cảnh ngắn gọn (1-2 câu, tiếng Việt) để đặt một đoạn văn bản \
pháp luật vào bối cảnh của nó, giúp việc tìm kiếm (semantic search) chính xác hơn khi đoạn này được \
tách riêng khỏi toàn bộ văn bản. Câu ngữ cảnh nên nêu: đoạn này thuộc văn bản pháp luật nào (tên, \
loại), quy định về nội dung gì, và nếu có, nó sửa đổi/bổ sung hoặc liên quan đến văn bản pháp luật \
nào khác. KHÔNG lặp lại nguyên văn nội dung đoạn. Trả lời DUY NHẤT câu ngữ cảnh, không thêm giải \
thích hay markdown."""


def build_relations_summary(doc_id: str, edges: list[RelationEdge]) -> str:
    parts = [f"{e.relation_type}: {e.to_doc_text}" for e in edges if e.from_doc_id == doc_id]
    return "; ".join(parts) if parts else "(không có quan hệ được ghi nhận)"


def _chunk_heading(chunk: ArticleChunk) -> str:
    if chunk.article_number is not None:
        heading = f"Điều {chunk.article_number}"
        if chunk.article_heading:
            heading += f". {chunk.article_heading}"
        return heading
    if chunk.chunk_type == "annex":
        return "Phụ lục / phần đính kèm"
    return "Lời mở đầu / căn cứ ban hành"


def _generate_context(chunk: ArticleChunk, relations_summary: str, llm: ChatOpenAI) -> str:
    human = (
        f"Văn bản: {chunk.doc_title} ({chunk.doc_type.value})\n"
        f"Phần: {_chunk_heading(chunk)}\n"
        f"Quan hệ với văn bản khác: {relations_summary}\n"
        f"Nội dung đoạn (rút gọn):\n{chunk.text[:TEXT_PREVIEW_CHARS]}"
    )
    response = llm.invoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=human)])
    return response.content.strip()


def load_corpus(path: Path) -> list[ArticleChunk]:
    return [
        ArticleChunk.model_validate_json(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def contextualize_corpus(
    corpus_path: Path = CORPUS_PATH, relations_path: Path = RELATIONS_PATH
) -> None:
    chunks = load_corpus(corpus_path)
    edges = load_relations_file(relations_path) if relations_path.exists() else []
    relations_by_doc = {
        doc_id: build_relations_summary(doc_id, edges) for doc_id in {c.doc_id for c in chunks}
    }

    llm = ChatOpenAI(model=CONTEXT_MODEL, temperature=0)

    def process(chunk: ArticleChunk) -> ArticleChunk:
        # "khoan" chunks are structural sub-records (see khoan_split.py), not
        # yet part of retrieval — skip the blurb/LLM cost until a later
        # phase decides they're ready to be embedded and searched directly.
        if chunk.chunk_type == "khoan":
            return chunk
        blurb = _generate_context(chunk, relations_by_doc[chunk.doc_id], llm)
        chunk.embedding_text = f"{blurb}\n\n{chunk.text}"
        return chunk

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        contextualized = list(pool.map(process, chunks))

    with corpus_path.open("w", encoding="utf-8") as f:
        for chunk in contextualized:
            f.write(chunk.model_dump_json() + "\n")

    print(f"Contextualized {len(contextualized)} chunks -> {corpus_path}")


if __name__ == "__main__":
    contextualize_corpus()
