"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Scale, SquarePen, X } from "lucide-react";
import { AnswerMode, ChatHistoryItem } from "@/lib/types";
import { useChatStore } from "@/lib/chat-store";
import { useAuth } from "@/lib/auth-client";
import { ConversationSummary, listConversations } from "@/lib/api";
import { cn } from "@/lib/utils";
import { domainMeta, representativeDomain } from "@/lib/domain";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarAccount } from "./SidebarAccount";

const GROUP_ORDER = ["Hôm nay", "Hôm qua", "7 ngày qua", "Cũ hơn"] as const;

// Ambiguous/cross-domain items (representativeDomain returned null) fall
// back to this — same citizen/professional dot the sidebar used everywhere
// before domain existed, so an item with no confident single domain still
// reads as "something", not a blank.
const MODE_DOT: Record<AnswerMode, string> = {
  citizen: "bg-citizen",
  professional: "bg-professional",
};

function groupLabel(iso: string, now: Date): (typeof GROUP_ORDER)[number] {
  const date = new Date(iso);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (diffDays <= 0) return "Hôm nay";
  if (diffDays === 1) return "Hôm qua";
  if (diffDays <= 7) return "7 ngày qua";
  return "Cũ hơn";
}

function relativeTime(iso: string, now: Date): string {
  const date = new Date(iso);
  const diffMin = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (diffMin < 1) return "vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffMin < 24 * 60) return `${Math.round(diffMin / 60)} giờ trước`;
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export function ChatSidebar({
  open,
  onClose,
  collapsed,
  onToggleCollapsed,
}: {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();
  const { conversations } = useChatStore();
  const { user } = useAuth();
  const now = useMemo(() => new Date(), []);

  const activeId = pathname?.startsWith("/c/") ? pathname.slice(3) : null;

  // Persisted history (DB, via guest cookie or account) — refetched whenever
  // a new live conversation appears (that's the moment a previous fetch
  // could be missing something) OR the signed-in identity changes (login,
  // logout, switching accounts), so a previous account's history can't
  // linger after that. The in-memory `live` list below always wins over
  // this for a given id, so a slightly stale fetch never shows outdated
  // titles/previews for the conversation currently on screen.
  const [persisted, setPersisted] = useState<ConversationSummary[]>([]);
  const [loadingPersisted, setLoadingPersisted] = useState(true);
  const liveCount = Object.keys(conversations).length;
  useEffect(() => {
    let cancelled = false;
    // The setLoadingPersisted(true) below has to happen once this refetch
    // actually starts (not synchronously in the effect body — see
    // react-hooks/set-state-in-effect) so it's the async callback's first
    // line rather than a bare call before it.
    async function load() {
      setLoadingPersisted(true);
      const list = await listConversations();
      if (cancelled) return;
      setPersisted(list);
      setLoadingPersisted(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [liveCount, user?.id]);

  const items = useMemo<ChatHistoryItem[]>(() => {
    const live: ChatHistoryItem[] = Object.values(conversations)
      .filter((c) => c.messages.length > 0)
      .map((c) => {
        const lastAssistant = [...c.messages].reverse().find((m) => m.role === "assistant");
        return {
          id: c.id,
          title: c.title,
          preview: c.messages[c.messages.length - 1]?.text || c.messages[0]?.text || "",
          updatedAt: c.createdAt,
          mode: c.mode,
          domain: representativeDomain(lastAssistant?.domains),
          messages: c.messages,
        };
      });
    const liveIds = new Set(live.map((c) => c.id));
    const fromDb: ChatHistoryItem[] = persisted
      .filter((c) => !liveIds.has(c.id))
      .map((c) => ({
        id: c.id,
        title: c.title,
        preview: c.preview,
        updatedAt: c.updatedAt,
        mode: c.mode,
        domain: c.domain,
        messages: [],
      }));
    return [...live, ...fromDb];
  }, [conversations, persisted]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, ChatHistoryItem[]>();
    for (const item of [...items].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )) {
      const label = groupLabel(item.updatedAt, now);
      if (!byGroup.has(label)) byGroup.set(label, []);
      byGroup.get(label)!.push(item);
    }
    return GROUP_ORDER.filter((label) => byGroup.has(label)).map((label) => ({
      label,
      items: byGroup.get(label)!,
    }));
  }, [items, now]);

  return (
    <>
      {open && (
        <div
          aria-hidden
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] md:hidden"
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 ease-out md:static md:z-auto md:translate-x-0 md:transition-[width]",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:w-16" : "md:w-72"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 border-b border-sidebar-border px-3 py-3.5",
            collapsed && "md:justify-center"
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Scale size={16} />
          </span>
          <span className={cn("min-w-0 flex-1 truncate font-heading text-sm font-semibold", collapsed && "md:hidden")}>
            Trợ lý Pháp luật
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng lịch sử"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-sidebar-accent md:hidden"
          >
            <X size={16} />
          </button>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Thu gọn thanh bên"
            title="Thu gọn thanh bên"
            className={cn(
              "hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent/70 text-muted-foreground transition-colors hover:bg-sidebar-accent md:flex",
              collapsed && "md:hidden"
            )}
          >
            <PanelLeftClose size={15} />
          </button>
        </div>

        {collapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Mở rộng thanh bên"
            title="Mở rộng thanh bên"
            className="mx-auto mt-2 hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent/70 text-muted-foreground transition-colors hover:bg-sidebar-accent md:flex"
          >
            <PanelLeftOpen size={15} />
          </button>
        )}

        <div className="px-3 pt-3 pb-2">
          <Link
            href="/"
            onClick={onClose}
            title={collapsed ? "Cuộc trò chuyện mới" : undefined}
            className={cn(
              "group flex w-full items-center gap-2.5 rounded-lg border border-l-4 border-border border-l-primary bg-card px-3 py-2.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:translate-y-0 active:scale-[0.99]",
              collapsed && "md:w-10 md:justify-center md:px-0"
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <SquarePen size={14} />
            </span>
            <span className={cn("font-serif text-[15px] font-medium text-foreground", collapsed && "md:hidden")}>
              Cuộc trò chuyện mới
            </span>
          </Link>
        </div>

        <ScrollArea className={cn("flex-1 px-2", collapsed && "md:hidden")}>
          <div className="flex flex-col gap-4 pt-1 pb-4">
            {loadingPersisted && groups.length === 0 && (
              <div className="flex flex-col gap-0.5 px-1" aria-label="Đang tải lịch sử trò chuyện">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex animate-pulse items-start gap-2.5 rounded-xl px-2 py-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sidebar-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block h-3 w-3/5 rounded bg-sidebar-accent" />
                      <span className="mt-1.5 block h-2.5 w-4/5 rounded bg-sidebar-accent/70" />
                    </span>
                  </div>
                ))}
              </div>
            )}
            {!loadingPersisted && groups.length === 0 && (
              <p className="px-3 py-6 text-center text-xs leading-relaxed text-muted-foreground">
                Chưa có lịch sử trò chuyện. Phần lớn người dùng truy cập ẩn danh nên lịch sử sẽ trống — điều đó bình thường.
              </p>
            )}
            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground/80 uppercase">
                  {group.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const active = item.id === activeId;
                    const meta = item.domain ? domainMeta(item.domain) : null;
                    return (
                      <Link
                        key={item.id}
                        href={`/c/${item.id}`}
                        onClick={onClose}
                        title={meta ? meta.label : undefined}
                        className={cn(
                          "group flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                          active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/70"
                        )}
                      >
                        {meta ? (
                          <meta.icon size={14} className={cn("mt-0.5 shrink-0", meta.text)} aria-hidden />
                        ) : (
                          <span
                            className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", MODE_DOT[item.mode])}
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-medium">{item.title}</span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {relativeTime(item.updatedAt, now)}
                            </span>
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{item.preview}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className={cn("px-3", collapsed && "md:px-1.5")}>
          <div className="border-t border-sidebar-border pt-2 pb-2.5">
            <SidebarAccount collapsed={collapsed} />
          </div>
        </div>
      </aside>
    </>
  );
}
