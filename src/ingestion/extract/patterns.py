from __future__ import annotations

import re

from ingestion.models import Domain, DocType

HEADER_RE = re.compile(r"^(Tên|Loại|Mô tả|File|Nguồn|Quan hệ):\s*(.*)$")
BULLET_RE = re.compile(r"^[-*]\s*(.+)$")
DOC_NUMBER_RE = re.compile(r"(\d+/\d{4}/[A-ZĐ0-9\-]+)")
DATE_RE = re.compile(r"(\d{2})/(\d{2})/(\d{4})")

DOC_TYPE_MAP = {
    "Luật": DocType.LUAT,
    "Nghị định": DocType.NGHI_DINH,
    "Thông tư": DocType.THONG_TU,
    "Bộ luật": DocType.BO_LUAT,
}

# Domain is inferred from which top-level docs/ subfolder a document lives
# under (build_corpus.py's DOC_TYPE_DIRS-equivalent discovery), not from a
# meta_data.txt field — avoids having to hand-edit the field into every
# existing traffic-law meta_data.txt just to add a value that's the same
# for all of them. Case-insensitive on the folder name since it was created
# by hand (docs/CIVIL, docs/CRIMINAL).
DOMAIN_DIR_MAP = {
    "luat": Domain.GIAO_THONG,
    "nghi_dinh": Domain.GIAO_THONG,
    "thong_tu": Domain.GIAO_THONG,
    "civil": Domain.DAN_SU,
    "criminal": Domain.HINH_SU,
}

SECTION_KEYS = {
    "Tên": "ten",
    "Loại": "loai",
    "Mô tả": "mo_ta",
    "File": "file",
    "Nguồn": "nguon",
    "Quan hệ": "quan_he",
}


def merge_bullet_continuations(lines: list[str]) -> list[str]:
    """Join a bulleted section's lines into one entry per bullet, folding
    non-bulleted wrapped lines (e.g. a long relation description split onto
    a second, unindented line) into the preceding bullet."""
    items: list[str] = []
    for line in lines:
        bullet = BULLET_RE.match(line)
        if bullet:
            items.append(bullet.group(1).strip())
        elif items:
            items[-1] = f"{items[-1]} {line.strip()}"
        else:
            items.append(line.strip())
    return items
