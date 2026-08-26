from __future__ import annotations

import json
from pathlib import Path

from dotenv import load_dotenv

from .article_split import build_chunks
from .metadata_parse import parse_meta_data
from .models import ArticleChunk, DocumentMetadata
from .pdf_extract import tesseract_available
from .relations import build_doc_number_registry, parse_relations, resolve_relations

load_dotenv()

DOCS_ROOT = Path("docs")
# Despite the name, these are no longer all "doc type" dirs — CIVIL/CRIMINAL
# are DOMAIN dirs (each can contain multiple doc_type values, e.g.
# docs/CRIMINAL has both "Bộ luật" and "Luật" folders inside). Kept as one
# list since discovery doesn't care about the distinction, only
# metadata_parse.py::parse_meta_data does (via patterns.DOMAIN_DIR_MAP).
DOC_TYPE_DIRS = ["luat", "nghi_dinh", "thong_tu", "CIVIL", "CRIMINAL"]
OUTPUT_DIR = Path("data/processed")


def discover_folders() -> list[Path]:
    folders = []
    for sub in DOC_TYPE_DIRS:
        sub_path = DOCS_ROOT / sub
        if not sub_path.is_dir():
            continue
        for entry in sorted(sub_path.iterdir()):
            if entry.is_dir():
                folders.append(entry)
    return folders


def check_missing_files(meta: DocumentMetadata) -> list[str]:
    folder = Path(meta.folder_path)
    return [f for f in meta.files if not (folder / f).exists()]


def build_corpus() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ocr_ready = tesseract_available()
    if not ocr_ready:
        print(
            "WARNING: Tesseract OCR is not available on this machine — "
            "scanned-image PDFs will yield 0 chunks until it is installed. "
            "See the plan's Prerequisite section."
        )

    folders = discover_folders()
    all_meta: list[DocumentMetadata] = []
    meta_failures: list[str] = []
    for folder in folders:
        try:
            meta = parse_meta_data(folder)
            all_meta.append(meta)
        except Exception as exc:
            meta_failures.append(f"{folder.name}: {exc}")

    for meta in all_meta:
        missing = check_missing_files(meta)
        if missing:
            print(f"WARNING: {meta.doc_id} lists missing files: {missing}")

    registry = build_doc_number_registry(all_meta)

    all_chunks: list[ArticleChunk] = []
    zero_chunk_docs: list[str] = []
    review_flagged: list[dict] = []
    for meta in all_meta:
        chunks = build_chunks(meta)
        if not chunks:
            zero_chunk_docs.append(meta.doc_id)
        for chunk in chunks:
            if chunk.needs_review:
                review_flagged.append(
                    {
                        "chunk_id": chunk.chunk_id,
                        "doc_id": chunk.doc_id,
                        "source_file": chunk.source_file,
                        "ocr_confidence": chunk.ocr_confidence,
                    }
                )
        all_chunks.extend(chunks)

    all_edges = []
    unresolved_edges = []
    for meta in all_meta:
        edges = resolve_relations(parse_relations(Path(meta.folder_path), meta.doc_id), registry)
        for edge in edges:
            if edge.to_doc_id is None:
                unresolved_edges.append(f"{edge.from_doc_id} --{edge.relation_type}--> {edge.to_doc_text}")
        all_edges.extend(edges)

    corpus_path = OUTPUT_DIR / "corpus.jsonl"
    with corpus_path.open("w", encoding="utf-8") as f:
        for chunk in all_chunks:
            f.write(chunk.model_dump_json() + "\n")

    relations_path = OUTPUT_DIR / "relations.json"
    relations_path.write_text(
        json.dumps([e.model_dump() for e in all_edges], ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )

    review_path = OUTPUT_DIR / "ocr_review_flags.json"
    review_path.write_text(
        json.dumps(review_flagged, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\nParsed {len(all_meta)}/{len(folders)} documents ({len(meta_failures)} metadata failures)")
    for failure in meta_failures:
        print(f"  FAIL: {failure}")
    print(f"Wrote {len(all_chunks)} chunks -> {corpus_path}")
    print(f"Wrote {len(all_edges)} relations ({len(unresolved_edges)} unresolved) -> {relations_path}")
    print(f"OCR-flagged (needs_review) chunks: {len(review_flagged)} -> {review_path}")
    if zero_chunk_docs:
        print(f"Documents with ZERO chunks (likely OCR unavailable/failed): {zero_chunk_docs}")


if __name__ == "__main__":
    build_corpus()
