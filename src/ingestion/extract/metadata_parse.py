from __future__ import annotations

from datetime import date
from pathlib import Path

from ingestion.models import DocumentMetadata
from ingestion.extract.patterns import (
    DATE_RE,
    DOC_NUMBER_RE,
    DOC_TYPE_MAP,
    DOMAIN_DIR_MAP,
    HEADER_RE,
    SECTION_KEYS,
    merge_bullet_continuations,
)


def parse_raw_sections(text: str) -> dict[str, list[str]]:
    """Split a meta_data.txt body into its labeled sections, line-accumulated."""
    sections: dict[str, list[str]] = {key: [] for key in SECTION_KEYS.values()}
    current: str | None = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        header_match = HEADER_RE.match(line)
        if header_match:
            label, inline_value = header_match.groups()
            current = SECTION_KEYS[label]
            if inline_value:
                sections[current].append(inline_value)
            continue
        if not line:
            continue
        if current is not None:
            sections[current].append(line)
    return sections


def parse_effective_date(quan_he_lines: list[str]) -> date | None:
    for item in merge_bullet_continuations(quan_he_lines):
        if item.startswith("Có hiệu lực từ"):
            match = DATE_RE.search(item)
            if match:
                day, month, year = match.groups()
                return date(int(year), int(month), int(day))
    return None


def parse_meta_data(folder_path: Path) -> DocumentMetadata:
    meta_path = folder_path / "meta_data.txt"
    text = meta_path.read_text(encoding="utf-8")
    sections = parse_raw_sections(text)

    title = " ".join(sections["ten"]).strip()
    loai_raw = " ".join(sections["loai"]).strip()
    doc_type = DOC_TYPE_MAP.get(loai_raw)
    if doc_type is None:
        raise ValueError(f"Unrecognized Loai '{loai_raw}' in {meta_path}")

    number_match = DOC_NUMBER_RE.search(title)
    doc_number = number_match.group(1) if number_match else ""

    description = " ".join(sections["mo_ta"]).strip()

    files = merge_bullet_continuations(sections["file"])

    source = " ".join(sections["nguon"]).strip()

    effective_date = parse_effective_date(sections["quan_he"])

    # Domain comes from the top-level docs/ subfolder name (folder_path's
    # grandparent — folder_path itself is the document's own folder, e.g.
    # docs/CIVIL/BLDS_91_2015_QH13), not from a meta_data.txt field. See
    # patterns.py::DOMAIN_DIR_MAP for why.
    domain_dir = folder_path.parent.name.lower()
    domain = DOMAIN_DIR_MAP.get(domain_dir)
    if domain is None:
        raise ValueError(
            f"Unrecognized domain folder '{folder_path.parent.name}' for {meta_path} "
            f"— add it to patterns.py::DOMAIN_DIR_MAP"
        )

    return DocumentMetadata(
        doc_id=folder_path.name,
        title=title,
        doc_type=doc_type,
        domain=domain,
        doc_number=doc_number,
        description=description,
        source=source,
        files=files,
        effective_date=effective_date,
        folder_path=str(folder_path),
    )
