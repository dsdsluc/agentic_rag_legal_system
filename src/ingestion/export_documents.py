from __future__ import annotations

import json
from pathlib import Path

from .build_corpus import discover_folders
from .metadata_parse import parse_meta_data
from .models import DocumentMetadata

OUTPUT_DIR = Path("data/processed")

# corpus.jsonl only ever carried doc_id/doc_type/doc_title per chunk — never
# doc_number/description/source/effective_date, since ArticleChunk doesn't
# need those for retrieval. The Postgres Document table (web/prisma) does.
# Standalone rather than folded into build_corpus.py: it only needs
# parse_meta_data (reads meta_data.txt), nothing from the OCR/chunking/
# enrichment steps — running it never touches corpus.jsonl, so it's safe to
# run anytime without risk of re-triggering (and overwriting) the rest of
# the pipeline's accumulated work (khoan_split, fine_amount, khoan_relations,
# contextualize all write into corpus.jsonl and would be wiped by a fresh
# build_corpus() run).


def export_documents(output_dir: Path = OUTPUT_DIR) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    folders = discover_folders()
    all_meta: list[DocumentMetadata] = []
    failures: list[str] = []
    for folder in folders:
        try:
            all_meta.append(parse_meta_data(folder))
        except Exception as exc:
            failures.append(f"{folder.name}: {exc}")

    documents_path = output_dir / "documents.json"
    documents_path.write_text(
        json.dumps([m.model_dump(mode="json") for m in all_meta], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {len(all_meta)} documents -> {documents_path}")
    if failures:
        print(f"Metadata failures ({len(failures)}): {failures}")


if __name__ == "__main__":
    export_documents()
