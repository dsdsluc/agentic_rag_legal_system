from __future__ import annotations

import re

# Deterministic, zero-LLM-cost pre-check run on every user-supplied string
# (question + each history turn) before it reaches any LLM call. Catches the
# obvious, common jailbreak/injection phrasings cheaply; it is NOT a
# replacement for the "treat history as untrusted data" prompt hardening in
# query_rewrite.py — this is a fast first filter, that is defense-in-depth
# for what gets past it.
_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(the\s+)?previous\s+instructions",
    r"disregard\s+(all\s+)?(the\s+)?(previous|above)\s+instructions",
    r"bỏ\s*qua\s+(tất\s*cả\s+)?(các\s+)?(hướng\s*dẫn|chỉ\s*thị|yêu\s*cầu)\s+(trước|ở\s*trên)",
    r"quên\s+(hết\s+)?(các\s+)?(hướng\s*dẫn|chỉ\s*thị)\s+(trước|ở\s*trên)",
    r"new\s+instructions?\s*:",
    r"system\s*prompt",
    r"tiết\s*lộ\s+(prompt|chỉ\s*thị)\s+hệ\s*thống",
    r"you\s+are\s+now\s+(a|an)\b",
    r"pretend\s+you\s+are",
    r"act\s+as\s+(if\s+)?you",
    r"đóng\s+vai\s+(là\s+)?",
    r"bypass\s+(all\s+)?restrictions",
    r"---\s*end\s*(of)?\s*(prompt|context)",
]

_COMPILED = [re.compile(p, re.IGNORECASE) for p in _INJECTION_PATTERNS]


def is_suspicious(text: str) -> tuple[bool, str | None]:
    """Cheap regex scan for common prompt-injection phrasings. Returns
    (True, matched_pattern) on the first hit, (False, None) if clean.
    False negatives are expected and fine — this is a first filter, not a
    complete defense (see query_rewrite.py's untrusted-data framing for the
    rest of the layering)."""
    for pattern in _COMPILED:
        if pattern.search(text):
            return True, pattern.pattern
    return False, None
