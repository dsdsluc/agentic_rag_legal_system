from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

from ingestion.models import RelationEdge
from ingestion.enrich.relations import load_relations_file

RELATIONS_PATH = Path("data/processed/relations.json")


@lru_cache(maxsize=1)
def load_relations(path: Path = RELATIONS_PATH) -> list[RelationEdge]:
    return load_relations_file(path)


def find_amending_doc_ids(doc_id: str, edges: Optional[list[RelationEdge]] = None) -> list[str]:
    """Doc ids of documents that amend `doc_id` — a later Nghị định/Thông tư
    that changes its provisions — per the "sửa đổi, bổ sung" relations
    parsed from meta_data.txt.

    Relation phrasing encodes direction: "được sửa đổi, bổ sung bởi" (passive,
    "amended by") means from_doc_id was amended by to_doc_id; plain "sửa đổi,
    bổ sung" (active, "amends") means from_doc_id amends to_doc_id.
    """
    edges = edges if edges is not None else load_relations()
    result: set[str] = set()
    for edge in edges:
        rtype = edge.relation_type.lower()
        if "sửa đổi" not in rtype and "bổ sung" not in rtype:
            continue
        is_passive = "được" in rtype or "bởi" in rtype
        if is_passive and edge.from_doc_id == doc_id and edge.to_doc_id:
            result.add(edge.to_doc_id)
        elif not is_passive and edge.to_doc_id == doc_id:
            result.add(edge.from_doc_id)
    return sorted(result)


@dataclass
class GraphHit:
    doc_id: str
    hop: int
    relation_type: str
    via_doc_id: str


# "Liên quan đến" ("related to") is a catch-all relation — in a small,
# single-topic corpus almost every document ends up tagged related to almost
# every other one, so following it adds a chunk from nearly every document
# in the corpus (observed: 5 direct hits -> 21 total at just 1 hop) without
# meaningfully sharpening relevance. Excluded by default; the more specific
# relations (hướng dẫn/implements, sửa đổi/amends) stay precise at any depth.
GENERIC_RELATION_MARKERS = ("liên quan đến",)


def build_undirected_adjacency(
    edges: list[RelationEdge], exclude_generic: bool = True
) -> dict[str, list[tuple[str, str]]]:
    """doc_id -> [(neighbor_doc_id, relation_type), ...]. Traversal treats
    every relation as bidirectional (a Luật "hướng dẫn bởi" a Nghị định is
    just as relevant found from either side) — direction is only meaningful
    for the amends/amended-by pair, which find_amending_doc_ids handles
    separately with directional logic before this ever runs."""
    adjacency: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for edge in edges:
        if not edge.to_doc_id:
            continue
        rtype = edge.relation_type.lower()
        if exclude_generic and any(marker in rtype for marker in GENERIC_RELATION_MARKERS):
            continue
        adjacency[edge.from_doc_id].append((edge.to_doc_id, edge.relation_type))
        adjacency[edge.to_doc_id].append((edge.from_doc_id, edge.relation_type))
    return adjacency


def traverse_graph(
    start_doc_ids: set[str],
    max_hops: int = 2,
    edges: Optional[list[RelationEdge]] = None,
    exclude_generic: bool = True,
) -> list[GraphHit]:
    """Breadth-first walk of the relation graph out from start_doc_ids, up
    to max_hops away, visiting each doc_id at most once (cycle-safe)."""
    edges = edges if edges is not None else load_relations()
    adjacency = build_undirected_adjacency(edges, exclude_generic=exclude_generic)

    visited = set(start_doc_ids)
    hits: list[GraphHit] = []
    queue: deque[tuple[str, int]] = deque((doc_id, 0) for doc_id in start_doc_ids)

    while queue:
        doc_id, hop = queue.popleft()
        if hop >= max_hops:
            continue
        for neighbor, relation_type in adjacency.get(doc_id, []):
            if neighbor in visited:
                continue
            visited.add(neighbor)
            hits.append(GraphHit(doc_id=neighbor, hop=hop + 1, relation_type=relation_type, via_doc_id=doc_id))
            queue.append((neighbor, hop + 1))

    return hits
