"use client";

import Link from "next/link";
import { Lock, MessageSquare, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-client";

export function AdminForbiddenScreen() {
  const { user, loading, openDialog } = useAuth();

  return (
    <div className="min-h-full">
      <div className="flex items-center justify-between border-b border-border/70 px-6 py-2.5 lg:px-12">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          <ShieldCheck size={12} />
          Admin
        </span>
        <Link
          href="/"
          title="Về trang trò chuyện"
          aria-label="Về trang trò chuyện"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground"
        >
          <MessageSquare size={14} />
        </Link>
      </div>
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Lock size={22} />
        </span>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Khu vực quản trị</h1>
        {!loading && (
          <p className="text-sm text-muted-foreground">
            {user
              ? "Tài khoản của bạn không có quyền quản trị hệ thống."
              : "Đăng nhập bằng tài khoản quản trị để truy cập khu vực này."}
          </p>
        )}
        {!loading && !user && (
          <button
            type="button"
            onClick={() => openDialog()}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Đăng nhập
          </button>
        )}
      </div>
    </div>
  );
}
