"use client";

import { useEffect, useState } from "react";
import type { RecruiterNote } from "./types";

// Same fetch-on-mount shape as lib/announcement.ts's useAnnouncement, kept
// as a separate hook (not folded into that one) because this note has a
// different audience/purpose — see RecruiterNote in schema.prisma — and no
// read-tracking: it's a static info panel for an outside evaluator, not a
// chronological announcement that needs an "unread" dot.
export function useRecruiterNote() {
  const [note, setNote] = useState<RecruiterNote | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/note")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled) return;
        const n: RecruiterNote | undefined = body?.note;
        if (!n) return;
        setNote(n);
      })
      .catch(() => {
        // Best-effort — no note button is a safe fallback, not a broken page.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { note };
}
