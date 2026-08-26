from __future__ import annotations

import json
from pathlib import Path

from .metadata_parse import parse_raw_sections
from .models import DocumentMetadata, RelationEdge
from .patterns import DOC_NUMBER_RE, merge_bullet_continuations


def parse_relations(folder_path: Path, from_doc_id: str) -> list[RelationEdge]:
    meta_path = folder_path / "meta_data.txt"
    text = meta_path.read_text(encoding="utf-8")
    sections = parse_raw_sections(text)

    edges: list[RelationEdge] = []
    for content in merge_bullet_continuations(sections["quan_he"]):
        if content.startswith("Có hiệu lực từ"):
            continue
        if ":" not in content:
            continue
        relation_type, to_doc_text = content.split(":", 1)
        edges.append(
            RelationEdge(
                from_doc_id=from_doc_id,
                relation_type=relation_type.strip(),
                to_doc_text=to_doc_text.strip(),
            )
        )
    return edges


def load_relations_file(path: Path) -> list[RelationEdge]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return [RelationEdge(**item) for item in data]


def build_doc_number_registry(all_metadata: list[DocumentMetadata]) -> dict[str, str]:
    return {m.doc_number: m.doc_id for m in all_metadata if m.doc_number}


def resolve_relations(
    edges: list[RelationEdge], registry: dict[str, str]
) -> list[RelationEdge]:
    resolved = []
    for edge in edges:
        match = DOC_NUMBER_RE.search(edge.to_doc_text)
        to_doc_id = registry.get(match.group(1)) if match else None
        resolved.append(edge.model_copy(update={"to_doc_id": to_doc_id}))
    return resolved
