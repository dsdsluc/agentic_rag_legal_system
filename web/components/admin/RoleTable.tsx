"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-client";
import type { AdminUserRow } from "@/lib/adminUsers";
import { ConfirmDialog } from "./ConfirmDialog";

type PendingAction =
  | { kind: "role"; user: AdminUserRow; nextRole: "user" | "admin" }
  | { kind: "editFlag"; user: AdminUserRow; next: boolean };

function actionCopy(action: PendingAction): { title: string; description: string; confirmLabel: string; destructive?: boolean } {
  if (action.kind === "role") {
    return action.nextRole === "admin"
      ? {
          title: "Cấp quyền Admin?",
          description: `${action.user.name} (${action.user.email}) sẽ có toàn quyền quản trị hệ thống, bao gồm cả việc đổi quyền người khác.`,
          confirmLabel: "Cấp quyền Admin",
        }
      : {
          title: "Gỡ quyền Admin?",
          description: `${action.user.name} (${action.user.email}) sẽ mất quyền truy cập khu vực quản trị.`,
          confirmLabel: "Gỡ quyền Admin",
          destructive: true,
        };
  }
  return action.next
    ? {
        title: "Cấp quyền sửa Legal Workspace?",
        description: `${action.user.name} sẽ thấy nút chỉnh sửa trên các Điều/Khoản trong Thư viện văn bản, giống quyền của Admin.`,
        confirmLabel: "Cấp quyền",
      }
    : {
        title: "Gỡ quyền sửa Legal Workspace?",
        description: `${action.user.name} sẽ không còn thấy nút chỉnh sửa trên Thư viện văn bản nữa.`,
        confirmLabel: "Gỡ quyền",
        destructive: true,
      };
}

export function RoleTable({ rows }: { rows: AdminUserRow[] }) {
  const router = useRouter();
  const { user: me } = useAuth();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!pending) return;
    setSaving(true);
    setError(null);
    try {
      const body = pending.kind === "role" ? { role: pending.nextRole } : { canEditLegalDocs: pending.next };
      const res = await fetch(`/api/admin/users/${pending.user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Không thể lưu.");
      setPending(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đã xảy ra lỗi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
            <th className="px-5 py-3 font-medium">Người dùng</th>
            <th className="px-5 py-3 font-medium">Vai trò</th>
            <th className="px-5 py-3 font-medium">Sửa Legal WS</th>
            <th className="px-5 py-3 text-right font-medium">Hành động</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isSelf = r.id === me?.id;
            return (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="px-5 py-4">
                  <p className="font-medium">
                    {r.name}
                    {isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(bạn)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.email}</p>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      r.role === "admin" ? "bg-professional-soft text-professional-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {r.role === "admin" ? <ShieldCheck size={11} /> : <Shield size={11} />}
                    {r.role === "admin" ? "Admin" : "User"}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      r.canEditLegalDocs ? "bg-citizen-soft text-citizen-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {r.canEditLegalDocs ? "Có" : "Không"}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      title={isSelf && r.role === "admin" ? "Không thể tự gỡ quyền admin của chính mình" : undefined}
                      disabled={isSelf && r.role === "admin"}
                      onClick={() => setPending({ kind: "role", user: r, nextRole: r.role === "admin" ? "user" : "admin" })}
                      className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {r.role === "admin" ? "Gỡ Admin" : "Đặt làm Admin"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPending({ kind: "editFlag", user: r, next: !r.canEditLegalDocs })}
                      className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                    >
                      {r.canEditLegalDocs ? "Gỡ quyền sửa" : "Cấp quyền sửa"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setPending(null);
              setError(null);
            }
          }}
          loading={saving}
          error={error}
          onConfirm={handleConfirm}
          {...actionCopy(pending)}
        />
      )}
    </div>
  );
}
