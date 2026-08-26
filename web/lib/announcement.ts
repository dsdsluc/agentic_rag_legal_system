"use client";

import { useEffect, useState } from "react";
import type { Announcement } from "./types";

const READ_KEY_PREFIX = "announcement-read:";

export function useAnnouncement() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [read, setRead] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/announcement")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled) return;
        const a: Announcement | undefined = body?.announcement;
        if (!a) return;
        // Always kept, even when a.active is false — professionalModeEnabled
        // (read by ModeBubble/chat-store) is independent of whether the
        // notification banner itself is shown. NotificationZone gates its
        // own rendering on `announcement.active` instead.
        setAnnouncement(a);
        try {
          setRead(localStorage.getItem(READ_KEY_PREFIX + a.updatedAt) === "1");
        } catch {
          setRead(false);
        }
      })
      .catch(() => {
        // Best-effort — no banner is a safe fallback, not a broken page.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function markRead() {
    if (!announcement) return;
    setRead(true);
    try {
      localStorage.setItem(READ_KEY_PREFIX + announcement.updatedAt, "1");
    } catch {
      // Ignore — the open card already shows the message either way.
    }
  }

  return { announcement, unread: (announcement?.active ?? false) && !read, markRead };
}
