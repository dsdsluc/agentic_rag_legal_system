"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Lock, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-client";
import { AuthField } from "@/components/AuthField";
import { AuthBenefits } from "@/components/AuthBenefits";

export function AuthDialog() {
  const { dialogOpen, closeDialog, setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset() {
    setEmail("");
    setPassword("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Đã xảy ra lỗi không xác định.");
        return;
      }
      setUser(data.user);
      reset();
      closeDialog();
    } catch {
      setError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          closeDialog();
        }
      }}
    >
      <DialogContent className="max-w-4xl overflow-hidden p-0">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.15fr]">
          <div className="hidden md:block">
            <AuthBenefits />
          </div>

          <div className="p-8 lg:p-12">
            <DialogTitle>Đăng nhập</DialogTitle>
            <p className="mt-1 text-sm text-muted-foreground">Chào mừng bạn quay trở lại.</p>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <AuthField
                id="auth-email"
                label="Email"
                type="email"
                icon={Mail}
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban@email.com"
              />
              <AuthField
                id="auth-password"
                label="Mật khẩu"
                type="password"
                icon={Lock}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />

              {error && <p className="text-sm text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={pending}
                className="mt-1 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {pending ? "Đang xử lý..." : "Đăng nhập"}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Chưa có tài khoản?{" "}
              <Link
                href="/dang-ky"
                onClick={() => {
                  reset();
                  closeDialog();
                }}
                className="font-medium text-primary hover:underline"
              >
                Đăng ký
              </Link>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
