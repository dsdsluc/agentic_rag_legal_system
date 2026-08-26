"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useAuth } from "@/lib/auth-client";
import { VanBanTopBar } from "@/components/VanBanTopBar";

export function VanBanLockedScreen() {
  const { openDialog } = useAuth();

  return (
    <>
      <VanBanTopBar />
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Lock size={22} />
        </span>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Legal Workspace yêu cầu đăng nhập</h1>
        <p className="text-sm text-muted-foreground">
          Kho văn bản pháp luật đầy đủ — Luật, Nghị định, Thông tư và các Điều, Khoản liên quan — chỉ dành
          cho tài khoản đã đăng ký, giống như chế độ Chuyên gia trong trò chuyện.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => openDialog()}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Đăng nhập
          </button>
          <Link
            href="/dang-ky"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Tạo tài khoản
          </Link>
        </div>
      </div>
    </>
  );
}
