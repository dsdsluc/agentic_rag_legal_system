"use client";

import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AdminUserRow } from "./UserTable";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN");
}

export function UserDetailDialog({
  open,
  onOpenChange,
  user,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUserRow;
  onEdit?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0">
        <Card className="ring-0">
          <CardHeader className="border-b border-border px-8 pt-7 pr-14 pb-5">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
                {user.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <CardTitle className="text-xl">{user.name}</CardTitle>
                <CardDescription className="truncate">{user.email}</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-8 px-8 py-7">
            <Section title="Thông tin cá nhân">
              <Field label="Số điện thoại" value={user.phone || "—"} />
              <Field label="Nghề nghiệp" value={user.occupation || "—"} />
              <Field label="Ngày tạo tài khoản" value={formatDateTime(user.createdAt)} />
              <Field label="Mã người dùng" value={<span className="font-mono text-xs">{user.id}</span>} />
            </Section>

            <Section title="Quyền & trạng thái">
              <Field
                label="Vai trò"
                value={
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      user.role === "admin" ? "bg-professional-soft text-professional-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {user.role === "admin" ? "Admin" : "User"}
                  </span>
                }
              />
              <Field
                label="Quyền sửa Legal Workspace"
                value={
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      user.canEditLegalDocs ? "bg-citizen-soft text-citizen-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {user.canEditLegalDocs ? "Có" : "Không"}
                  </span>
                }
              />
              <Field
                label="Trạng thái tài khoản"
                value={
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      user.isLocked ? "bg-destructive/10 text-destructive" : "bg-citizen-soft text-citizen-foreground"
                    )}
                  >
                    {user.isLocked ? "Đã khóa" : "Hoạt động"}
                  </span>
                }
              />
            </Section>

            <Section title="Hoạt động">
              <Field label="Trạng thái phiên" value={user.hasActiveSession ? "Đang đăng nhập" : "Không có phiên hiệu lực"} />
              <Field label="Đăng nhập gần nhất" value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Chưa từng đăng nhập"} />
              <Field label="Số cuộc hội thoại" value={String(user.conversationCount)} />
              <Field label="Tổng số phiên đăng nhập" value={String(user.sessionCount)} />
            </Section>
          </CardContent>

          <CardFooter className="justify-end gap-2 px-8 py-5">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Đóng
            </button>
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                <Pencil size={13} />
                Chỉnh sửa thông tin
              </button>
            )}
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
