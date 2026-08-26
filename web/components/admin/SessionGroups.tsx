"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./ConfirmDialog";

export interface SessionRow {
  id: string;
  createdAt: string;
  expiresAt: string;
  active: boolean;
}

export interface UserSessionGroup {
  userId: string;
  userName: string;
  userEmail: string;
  sessions: SessionRow[];
}

type PendingAction = { kind: "single"; sessionId: string; userName: string } | { kind: "all"; userId: string; userName: string; count: number };

export function SessionGroups({ groups }: { groups: UserSessionGroup[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!pending) return;
    setSaving(true);
    setError(null);
    try {
      if (pending.kind === "single") {
        const res = await fetch(`/api/admin/sessions/${pending.sessionId}`, { method: "DELETE" });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Không thể thu hồi.");
      } else {
        const res = await fetch(`/api/admin/users/${pending.userId}/revoke-sessions`, { method: "POST" });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Không thể thu hồi.");
      }
      setPending(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đã xảy ra lỗi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.userId} className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div>
              <p className="font-medium">{g.userName}</p>
              <p className="text-xs text-muted-foreground">{g.userEmail}</p>
            </div>
            <button
              type="button"
              onClick={() => setPending({ kind: "all", userId: g.userId, userName: g.userName, count: g.sessions.length })}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <KeyRound size={12} />
              Thu hồi tất cả ({g.sessions.length})
            </button>
          </div>
          <ul className="flex flex-col divide-y divide-border/70">
            {g.sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-semibold",
                      s.active ? "bg-citizen-soft text-citizen-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {s.active ? "Còn hiệu lực" : "Đã hết hạn"}
                  </span>
                  <span>Tạo lúc {new Date(s.createdAt).toLocaleString("vi-VN")}</span>
                  <span>·</span>
                  <span>Hết hạn {new Date(s.expiresAt).toLocaleString("vi-VN")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPending({ kind: "single", sessionId: s.id, userName: g.userName })}
                  title="Thu hồi phiên này"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

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
          title="Thu hồi phiên đăng nhập?"
          description={
            pending.kind === "single"
              ? `Một phiên của ${pending.userName} sẽ bị đăng xuất ngay lập tức.`
              : `Toàn bộ ${pending.count} phiên của ${pending.userName} sẽ bị đăng xuất, họ phải đăng nhập lại trên mọi thiết bị.`
          }
          confirmLabel="Thu hồi"
          destructive
        />
      )}
    </div>
  );
}
