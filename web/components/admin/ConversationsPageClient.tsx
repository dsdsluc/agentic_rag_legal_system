"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MessageSquareText, Search, User } from "lucide-react";
import { AdminPageHeader } from "./AdminPageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AdminConversationRow } from "@/lib/adminConversations";

type ModeFilter = "all" | "citizen" | "professional";

const MODE_LABELS: Record<ModeFilter, string> = {
  all: "Tất cả chế độ",
  citizen: "Người dân",
  professional: "Chuyên gia",
};

const PAGE_SIZE = 12;

function relativeOrDate(iso: string, now: Date): string {
  const date = new Date(iso);
  const diffMin = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (diffMin < 1) return "vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffMin < 24 * 60) return `${Math.round(diffMin / 60)} giờ trước`;
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function ConversationsPageClient({ rows }: { rows: AdminConversationRow[] }) {
  const [query, setQuery] = useState("");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [page, setPage] = useState(1);
  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (modeFilter !== "all" && r.mode !== modeFilter) return false;
      if (
        q &&
        !r.title.toLowerCase().includes(q) &&
        !r.ownerLabel.toLowerCase().includes(q) &&
        !(r.ownerEmail?.toLowerCase().includes(q) ?? false)
      ) {
        return false;
      }
      return true;
    });
  }, [rows, query, modeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="w-full px-6 py-6 lg:px-8">
      <AdminPageHeader
        title="Hội thoại"
        subtitle={`${filtered.length} / ${rows.length} cuộc trò chuyện gần nhất — dùng để rà soát nội dung, không phải để tra cứu toàn bộ lịch sử.`}
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
              <Search size={13} className="shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm theo tiêu đề hoặc người dùng…"
                className="w-56 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Select
              value={modeFilter}
              onValueChange={(v) => {
                setModeFilter(v as ModeFilter);
                setPage(1);
              }}
            >
              <SelectTrigger size="sm" className="bg-card">
                <SelectValue>{(v: ModeFilter) => MODE_LABELS[v]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả chế độ</SelectItem>
                <SelectItem value="citizen">Người dân</SelectItem>
                <SelectItem value="professional">Chuyên gia</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground uppercase">
              <th className="px-5 py-3 font-medium">Hội thoại</th>
              <th className="px-5 py-3 font-medium">Người dùng</th>
              <th className="px-5 py-3 font-medium">Chế độ</th>
              <th className="px-5 py-3 font-medium">Tin nhắn</th>
              <th className="px-5 py-3 font-medium">Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr key={r.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30">
                <td className="px-5 py-4">
                  <Link href={`/admin/hoi-thoai/${r.id}`} className="flex items-center gap-2 font-medium hover:underline">
                    <MessageSquareText size={14} className="shrink-0 text-muted-foreground" />
                    <span className="max-w-[320px] truncate">{r.title}</span>
                  </Link>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <User size={13} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-foreground">{r.ownerLabel}</p>
                      {r.ownerEmail && <p className="truncate">{r.ownerEmail}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                      r.mode === "professional"
                        ? "bg-professional-soft text-professional-foreground ring-professional/20"
                        : "bg-citizen-soft text-citizen-foreground ring-citizen/20"
                    )}
                  >
                    {r.mode === "professional" ? "Chuyên gia" : "Người dân"}
                  </span>
                </td>
                <td className="px-5 py-4 text-xs text-muted-foreground">{r.messageCount}</td>
                <td className="px-5 py-4 text-xs whitespace-nowrap text-muted-foreground">{relativeOrDate(r.updatedAt, now)}</td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">
                  Không có hội thoại nào phù hợp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Hiển thị {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} trên tổng số{" "}
            {filtered.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              aria-label="Trang trước"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="font-medium text-foreground">
              Trang {safePage}/{totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
              aria-label="Trang sau"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
