"use client";

import { usePathname } from "next/navigation";
import { Bell, StickyNote } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAnnouncement } from "@/lib/announcement";
import { useRecruiterNote } from "@/lib/note";

function formatUpdatedAt(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Fixed to the same bottom-right corner across both the citizen chat and
// Legal Workspace (mounted once in the root layout, not per page) — never
// on /admin, since admin is where this gets authored, not consumed. This is
// a *dock*, not a single button — the frosted glass panel (the "card" from
// the brief, iOS Camera-style: a little rounding, real transparency) is the
// extensible "notification area" itself; the bell is just its first
// occupant, anchored to the bottom edge so later additions (help, feedback,
// ...) stack above it inside the same panel rather than floating separately.
export function NotificationZone() {
  const pathname = usePathname();
  const { announcement, unread, markRead } = useAnnouncement();
  const { note } = useRecruiterNote();
  if (pathname?.startsWith("/admin") || (!announcement?.active && !note?.active)) return null;

  return (
    <div className="fixed right-7 bottom-12 z-40 flex min-h-32 w-14 flex-col items-center justify-end gap-1 rounded-xl border border-neutral-400/25 bg-neutral-500/15 py-2 shadow-lg shadow-black/10 backdrop-blur-xl dark:border-neutral-200/15 dark:bg-neutral-400/10">
        {note?.active && (
          <Popover>
            <PopoverTrigger
              aria-label="Ghi chú"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-foreground/10 active:bg-foreground/15"
            >
              <StickyNote size={19} strokeWidth={2} />
            </PopoverTrigger>
            <PopoverContent side="top" align="end" sideOffset={10} className="w-72">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <StickyNote size={12} />
                Ghi chú
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">{note.message}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">{formatUpdatedAt(note.updatedAt)}</p>
            </PopoverContent>
          </Popover>
        )}
        {announcement?.active && (
          <Popover onOpenChange={(open) => open && markRead()}>
            <PopoverTrigger
              aria-label="Thông báo"
              className="relative flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-foreground/10 active:bg-foreground/15"
            >
              <Bell size={19} strokeWidth={2} />
              {unread && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-citizen ring-2 ring-white/60 dark:ring-black/40" />
              )}
            </PopoverTrigger>
            <PopoverContent side="top" align="end" sideOffset={10} className="w-72">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <Bell size={12} />
                Thông báo
              </div>
              <p className="text-sm leading-relaxed text-foreground">{announcement.message}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">{formatUpdatedAt(announcement.updatedAt)}</p>
            </PopoverContent>
          </Popover>
        )}
    </div>
  );
}
