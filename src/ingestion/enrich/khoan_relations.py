from __future__ import annotations

import json
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langsmith import traceable

from ingestion.models import ArticleChunk, KhoanRelation
from ingestion.enrich.relations import load_relations_file

load_dotenv()

CORPUS_PATH = Path("data/processed/corpus.jsonl")
RELATIONS_PATH = Path("data/processed/relations.json")
OUTPUT_PATH = Path("data/processed/khoan_relations.json")
RELATION_MODEL = "gpt-4o-mini"
MAX_WORKERS = 8

DIEU_RE = re.compile(r"Điều\s*(\d+)", re.IGNORECASE)
HEADING_KHOAN_RE = re.compile(r"kho[aá]n\s*(\d+[a-zA-Z]?)", re.IGNORECASE)
# "khoản 5 Điều 6" appearing inline, inside a khoản's own body text — the
# "Điều 19"-style catch-all articles restate the target Điều per reference
# instead of once in the article heading, sometimes several per khoản.
INLINE_TARGET_RE = re.compile(r"kho[aả]n\s*(\d+[a-zA-Z]?)\s+Điều\s*(\d+)", re.IGNORECASE)
# First "khoản N" mentioned near the start of a child khoản's own text —
# the dominant pattern ("2. Sửa đổi, bổ sung điểm đ khoản 6 như sau: ...").
LEADING_KHOAN_RE = re.compile(r"^\s*\d+[a-zA-Z]?\.\s*.{0,60}?kho[aả]n\s*(\d+[a-zA-Z]?)", re.IGNORECASE | re.DOTALL)
CLAUSE_WORD_RE = re.compile(r"kho[aá]n|khoán|điểm|điêm", re.IGNORECASE)

_DIACRITIC_MAP = str.maketrans("đĐ", "dD")


def _strip_diacritics(text: str) -> str:
    """Normalize away Vietnamese diacritics (and OCR's inconsistent garbling
    of them) so a handful of ASCII keyword checks can classify the relation
    verb regardless of which mangled spelling OCR produced ("Sửa đỗi",
    "Sứa đổi", "Bồ sung", "Bỗ sung" all collapse to the same check)."""
    nfd = unicodedata.normalize("NFD", text.translate(_DIACRITIC_MAP))
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn").lower()


def classify_relation_verb(text: str) -> str:
    head = _strip_diacritics(text[:60])
    if "bai bo" in head:
        return "bãi bỏ"
    if "thay the" in head:
        return "thay thế"
    if "sua do" in head and "sung" in head:
        return "sửa đổi, bổ sung"
    if "sua do" in head:
        return "sửa đổi"
    if "sung" in head:
        return "bổ sung"
    return "sửa đổi, bổ sung"


def parse_heading_target_dieu(heading: Optional[str]) -> Optional[int]:
    if not heading:
        return None
    m = DIEU_RE.search(heading)
    return int(m.group(1)) if m else None


_QUOTED_SPAN_RE = re.compile(r'"[^"]*"')


def parse_inline_targets(text: str) -> list[tuple[str, int]]:
    """khoản/Điều references stated as the amendment's TARGET LOCATION
    (e.g. "...vào sau cụm từ ... tại điểm h khoản 3 Điều 6") — never inside
    a quoted span, which is either the new replacement text being inserted
    or old text being quoted verbatim, and can itself contain khoản/Điều
    references that have nothing to do with where THIS amendment applies
    (observed: a khoản whose inserted text itself cross-references "khoản
    3a Điều 29" of the same document — matching that as the target would be
    wrong). Stripping quoted spans before scanning avoids that false match."""
    unquoted = _QUOTED_SPAN_RE.sub("", text)
    return [(m.group(1), int(m.group(2))) for m in INLINE_TARGET_RE.finditer(unquoted)]


def parse_leading_khoan(text: str) -> Optional[str]:
    m = LEADING_KHOAN_RE.match(text)
    return m.group(1) if m else None


_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

RELATION_EXTRACT_PROMPT = """Bạn đọc một đoạn trong văn bản pháp luật sửa đổi, bổ sung văn bản "{target_title}". \
Xác định (các) khoản của văn bản gốc bị đoạn này sửa đổi, bổ sung, thay thế hoặc bãi bỏ.

{hint}

Nếu đoạn này chỉ bổ sung một Điều/khoản HOÀN TOÀN MỚI (không sửa nội dung đã có sẵn nào), để \
khoan_label = null. Nếu không xác định được Điều đích, bỏ qua mục đó (không đoán).

Trả lời DUY NHẤT một JSON hợp lệ, không markdown:
{{"targets": [{{"article_number": <số nguyên>, "khoan_label": "<chuỗi, vd \\"6\\" hoặc \\"8a\\", hoặc null>", \
"relation_type": "sửa đổi, bổ sung" | "bổ sung" | "bãi bỏ" | "thay thế"}}]}}"""


@traceable(name="extract_khoan_relation_llm", run_type="chain")
def extract_relations_llm(
    text: str, target_doc_title: str, known_dieu: Optional[int], llm: ChatOpenAI
) -> list[dict]:
    hint = (
        f"Gợi ý: đoạn này nằm trong phần sửa đổi Điều {known_dieu} của văn bản gốc."
        if known_dieu is not None
        else ""
    )
    system_prompt = RELATION_EXTRACT_PROMPT.format(target_title=target_doc_title, hint=hint)
    messages = [SystemMessage(content=system_prompt), HumanMessage(content=text)]
    try:
        response = llm.invoke(messages)
        raw = _JSON_FENCE_RE.sub("", response.content).strip()
        return json.loads(raw).get("targets", []) or []
    except Exception:
        return []


def load_corpus(path: Path) -> list[ArticleChunk]:
    return [
        ArticleChunk.model_validate_json(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _amending_pairs(relations_path: Path) -> list[tuple[str, str]]:
    """(amending_doc_id, target_doc_id) from the doc-level relation graph —
    active-direction "sửa đổi, bổ sung" edges only; the corpus also carries
    the passive mirror ("được sửa đổi, bổ sung bởi"), which would double
    every pair if not excluded."""
    edges = load_relations_file(relations_path)
    pairs = []
    for e in edges:
        rtype = e.relation_type.lower()
        is_passive = "được" in rtype or "bởi" in rtype
        if not is_passive and ("sửa đổi" in rtype or "bổ sung" in rtype) and e.to_doc_id:
            pairs.append((e.from_doc_id, e.to_doc_id))
    return pairs


def build_khoan_relations(
    corpus_path: Path = CORPUS_PATH,
    relations_path: Path = RELATIONS_PATH,
    output_path: Path = OUTPUT_PATH,
) -> None:
    chunks = load_corpus(corpus_path)
    children_by_parent: dict[str, list[ArticleChunk]] = {}
    for c in chunks:
        if c.chunk_type == "khoan":
            children_by_parent.setdefault(c.parent_chunk_id, []).append(c)
    valid_khoan_ids = {c.chunk_id for c in chunks if c.chunk_type == "khoan"}
    valid_article_ids = {c.chunk_id for c in chunks if c.chunk_type == "article"}
    doc_titles = {c.doc_id: c.doc_title for c in chunks}

    pairs = _amending_pairs(relations_path)
    if not pairs:
        print("No document-level 'sửa đổi, bổ sung' edges found in relations.json — nothing to do.")
        return

    def resolve(
        to_dieu: Optional[int], to_khoan: Optional[str], target_doc_id: str
    ) -> tuple[Optional[str], bool, Optional[str]]:
        if to_dieu is None:
            return None, False, "không xác định được Điều đích"
        if to_khoan is not None:
            candidate = f"{target_doc_id}::dieu_{to_dieu}::khoan_{to_khoan}"
            if candidate in valid_khoan_ids:
                return candidate, True, None
            return None, False, "khoản mới hoặc không khớp bản gốc trong corpus"
        candidate = f"{target_doc_id}::dieu_{to_dieu}"
        if candidate in valid_article_ids:
            return candidate, True, None
        return None, False, "Điều mới hoặc không khớp bản gốc trong corpus"

    def make_edge(
        from_chunk: ArticleChunk,
        target_doc_id: str,
        to_dieu: Optional[int],
        to_khoan: Optional[str],
        rtype: str,
    ) -> KhoanRelation:
        to_chunk_id, resolved, note = resolve(to_dieu, to_khoan, target_doc_id)
        return KhoanRelation(
            from_chunk_id=from_chunk.chunk_id,
            from_doc_id=from_chunk.doc_id,
            to_doc_id=target_doc_id,
            to_article_number=to_dieu,
            to_khoan_label=to_khoan,
            to_chunk_id=to_chunk_id,
            relation_type=rtype,
            resolved=resolved,
            note=note,
        )

    relations: list[KhoanRelation] = []
    llm_jobs: list[tuple[ArticleChunk, str, Optional[int]]] = []  # (chunk, target_doc_id, known_dieu)

    for amending_doc_id, target_doc_id in pairs:
        articles = [c for c in chunks if c.doc_id == amending_doc_id and c.chunk_type == "article"]
        for article in articles:
            heading = article.article_heading or ""
            target_dieu = parse_heading_target_dieu(heading)
            heading_khoan_nums = HEADING_KHOAN_RE.findall(heading)
            heading_mentions_clause = bool(CLAUSE_WORD_RE.search(heading))
            children = children_by_parent.get(article.chunk_id, [])

            if target_dieu is not None and len(heading_khoan_nums) == 1:
                # Heading already fully specifies one target — e.g. "Sửa
                # đổi, bổ sung điểm b khoản 8 Điều 13": the whole article's
                # content IS the replacement for that one khoản.
                relations.append(
                    make_edge(article, target_doc_id, target_dieu, heading_khoan_nums[0], classify_relation_verb(article.text))
                )
            elif target_dieu is not None and heading_mentions_clause and children:
                # Dominant case: "một số điểm, khoản của Điều N" — each
                # child khoản restates its own specific target khoản. Uses
                # only the heading's target_dieu (reliable — it's stated
                # once, outside any quoted replacement text) plus the
                # child's own leading khoản reference — deliberately NOT
                # parse_inline_targets here, since a child under an already-
                # known target_dieu has no legitimate reason to point
                # elsewhere, and quoted replacement text can contain
                # unrelated khoản/Điều cross-references that look like one.
                for child in children:
                    khoan_label = parse_leading_khoan(child.text)
                    if khoan_label:
                        relations.append(make_edge(child, target_doc_id, target_dieu, khoan_label, classify_relation_verb(child.text)))
                    else:
                        llm_jobs.append((child, target_doc_id, target_dieu))
            elif target_dieu is not None and heading_mentions_clause and not children:
                # Heading names multiple khoản ("khoản 2 và khoản 7") with
                # no further split to disambiguate against — let the LLM
                # read the body against the known target Điều.
                llm_jobs.append((article, target_doc_id, target_dieu))
            elif target_dieu is not None:
                # No "khoản"/"điểm" word in the heading at all — the whole
                # target Điều is being replaced wholesale, not one clause.
                relations.append(make_edge(article, target_doc_id, target_dieu, None, classify_relation_verb(article.text)))
            else:
                # Catch-all article (no target Điều in its own heading,
                # e.g. "Bổ sung, thay thế, bãi bỏ một số cụm từ..."): each
                # khoản restates its own target(s) inline, sometimes several.
                for child in children or [article]:
                    inline = parse_inline_targets(child.text)
                    if inline:
                        for khoan_label, dieu_num in inline:
                            relations.append(make_edge(child, target_doc_id, dieu_num, khoan_label, classify_relation_verb(child.text)))
                    else:
                        llm_jobs.append((child, target_doc_id, None))

    if llm_jobs:
        llm = ChatOpenAI(model=RELATION_MODEL, temperature=0)
        with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(llm_jobs))) as pool:
            futures = {
                pool.submit(extract_relations_llm, chunk.text, doc_titles.get(target_doc_id, target_doc_id), known_dieu, llm): (
                    chunk,
                    target_doc_id,
                )
                for chunk, target_doc_id, known_dieu in llm_jobs
            }
            for future, (chunk, target_doc_id) in futures.items():
                targets = future.result()
                if not targets:
                    relations.append(
                        KhoanRelation(
                            from_chunk_id=chunk.chunk_id,
                            from_doc_id=chunk.doc_id,
                            to_doc_id=target_doc_id,
                            relation_type=classify_relation_verb(chunk.text),
                            resolved=False,
                            note="không trích xuất được khoản đích (LLM)",
                        )
                    )
                    continue
                for t in targets:
                    dieu_num = t.get("article_number")
                    khoan_label = t.get("khoan_label")
                    relations.append(
                        make_edge(
                            chunk,
                            target_doc_id,
                            int(dieu_num) if dieu_num is not None else None,
                            str(khoan_label) if khoan_label is not None else None,
                            t.get("relation_type") or classify_relation_verb(chunk.text),
                        )
                    )

    output_path.write_text(
        json.dumps([r.model_dump() for r in relations], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    resolved_count = sum(1 for r in relations if r.resolved)
    print(
        f"Built {len(relations)} khoản-level relation edges "
        f"({resolved_count} resolved, {len(relations) - resolved_count} unresolved) "
        f"across {len(pairs)} amending-document pair(s); {len(llm_jobs)} LLM fallback calls -> {output_path}"
    )


if __name__ == "__main__":
    build_khoan_relations()
