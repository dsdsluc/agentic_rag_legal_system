"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AdminUserRow } from "./UserTable";

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary";

export function UserEditDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUserRow;
}) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [occupation, setOccupation] = useState(user.occupation ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError("Vui lòng nhập tên.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null, occupation: occupation.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Không thể lưu.");
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đã xảy ra lỗi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-6xl p-0">
        <Card className="ring-0">
          <CardHeader className="border-b border-border px-8 pt-7 pr-14 pb-5">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
                {user.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <CardTitle className="text-xl">Chỉnh sửa thông tin</CardTitle>
                <CardDescription className="truncate">{user.email}</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-8 px-8 py-7">
            <div>
              <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Thông tin cá nhân</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                  Họ tên
                  <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className={inputClass} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Email
                  <input
                    value={user.email}
                    disabled
                    className={cn(inputClass, "cursor-not-allowed bg-muted text-muted-foreground")}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  Số điện thoại
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Không bắt buộc"
                    className={cn(inputClass, "placeholder:text-muted-foreground")}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                  Nghề nghiệp
                  <input
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    placeholder="Không bắt buộc"
                    className={cn(inputClass, "placeholder:text-muted-foreground")}
                  />
                </label>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Quyền hạn</p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                <span>
                  Vai trò:{" "}
                  <span className="font-medium text-foreground">{user.role === "admin" ? "Admin" : "User"}</span>
                </span>
                <span>
                  Sửa Legal Workspace:{" "}
                  <span className="font-medium text-foreground">{user.canEditLegalDocs ? "Có" : "Không"}</span>
                </span>
                <span className="text-xs italic">Chỉnh sửa các quyền này tại trang Phân quyền.</span>
              </div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </CardContent>

          <CardFooter className="justify-end gap-2 px-8 py-5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Đang lưu…" : "Lưu thay đổi"}
            </button>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
