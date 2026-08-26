"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Eye, Lock, Pencil, Shield, ShieldCheck, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-client";
import type { AdminUserRow } from "@/lib/adminUsers";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "./ConfirmDialog";
import { UserDetailDialog } from "./UserDetailDialog";
import { UserEditDialog } from "./UserEditDialog";

export type { AdminUserRow } from "@/lib/adminUsers";

const PAGE_SIZE = 8;

export function UserTable({ rows }: { rows: AdminUserRow[] }) {
  const router = useRouter();
  const { user: me } = useAuth();
  const [viewing, setViewing] = useState<AdminUserRow | null>(null);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [lockTarget, setLockTarget] = useState<AdminUserRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function handleLockConfirm() {
    if (!lockTarget) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${lockTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isLocked: !lockTarget.isLocked }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Không thể lưu.");
      setLockTarget(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đã xảy ra lỗi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground uppercase">
              <th className="px-5 py-3 font-medium">Người dùng</th>
              <th className="px-5 py-3 font-medium">Vai trò</th>
              <th className="px-5 py-3 font-medium">Sửa Legal WS</th>
              <th className="px-5 py-3 font-medium">Hoạt động</th>
              <th className="px-5 py-3 font-medium">Ngày tạo</th>
              <th className="px-5 py-3 text-right font-medium">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => {
              const isSelf = r.id === me?.id;
              return (
                <tr
                  key={r.id}
                  className={cn(
                    "border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30",
                    r.isLocked && "opacity-70"
                  )}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold shadow-sm",
                          r.isLocked ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"
                        )}
                      >
                        {r.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium">
                          <span className="truncate">{r.name}</span>
                          {isSelf && <span className="shrink-0 text-xs font-normal text-muted-foreground">(bạn)</span>}
                          {r.isLocked && (
                            <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                              Đã khóa
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                        r.role === "admin"
                          ? "bg-professional-soft text-professional-foreground ring-professional/20"
                          : "bg-muted text-muted-foreground ring-border"
                      )}
                    >
                      {r.role === "admin" ? <ShieldCheck size={11} /> : <Shield size={11} />}
                      {r.role === "admin" ? "Admin" : "User"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                        r.canEditLegalDocs
                          ? "bg-citizen-soft text-citizen-foreground ring-citizen/20"
                          : "bg-muted text-muted-foreground ring-border"
                      )}
                    >
                      {r.canEditLegalDocs ? "Có" : "Không"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs whitespace-nowrap text-muted-foreground">
                    {r.conversationCount} hội thoại
                    <br />
                    {r.hasActiveSession ? <span className="text-citizen-foreground">đang đăng nhập</span> : "không có phiên"}
                  </td>
                  <td className="px-5 py-4 text-xs whitespace-nowrap text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger
                          onClick={() => setViewing(r)}
                          aria-label="Xem thông tin người dùng"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Eye size={15} />
                        </TooltipTrigger>
                        <TooltipContent>Xem thông tin</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          onClick={() => setEditing(r)}
                          aria-label="Chỉnh sửa thông tin"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Pencil size={15} />
                        </TooltipTrigger>
                        <TooltipContent>Chỉnh sửa thông tin</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          // TooltipTrigger doesn't forward a native `disabled`
                          // attribute reliably, and pointer-events-none would
                          // also kill the hover that shows the explanatory
                          // tooltip — so self-lock is guarded in the handler
                          // and communicated visually/via aria instead.
                          onClick={() => {
                            if (!isSelf) setLockTarget(r);
                          }}
                          aria-disabled={isSelf}
                          aria-label={r.isLocked ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                            isSelf
                              ? "cursor-not-allowed text-muted-foreground/40"
                              : r.isLocked
                                ? "text-citizen-foreground hover:bg-citizen-soft"
                                : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          )}
                        >
                          {r.isLocked ? <Unlock size={15} /> : <Lock size={15} />}
                        </TooltipTrigger>
                        <TooltipContent>
                          {isSelf ? "Không thể tự khóa chính mình" : r.isLocked ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                  Không có người dùng nào phù hợp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Hiển thị {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, rows.length)} trên tổng số {rows.length}
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

      {viewing && (
        <UserDetailDialog
          open
          onOpenChange={(open) => !open && setViewing(null)}
          user={viewing}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
        />
      )}
      {editing && <UserEditDialog open onOpenChange={(open) => !open && setEditing(null)} user={editing} />}

      {lockTarget && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setLockTarget(null);
              setError(null);
            }
          }}
          title={lockTarget.isLocked ? "Mở khóa tài khoản?" : "Khóa tài khoản?"}
          description={
            lockTarget.isLocked
              ? `${lockTarget.name} sẽ có thể đăng nhập trở lại.`
              : `${lockTarget.name} sẽ bị đăng xuất khỏi mọi thiết bị và không thể đăng nhập lại cho đến khi được mở khóa.`
          }
          confirmLabel={lockTarget.isLocked ? "Mở khóa" : "Khóa tài khoản"}
          destructive={!lockTarget.isLocked}
          loading={saving}
          error={error}
          onConfirm={handleLockConfirm}
        />
      )}
    </div>
  );
}
