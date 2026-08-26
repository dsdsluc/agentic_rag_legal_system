"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, User as UserIcon, Lock, Phone, Briefcase, Scale } from "lucide-react";
import { useAuth } from "@/lib/auth-client";
import { AuthField } from "@/components/AuthField";

export default function RegisterPage() {
  const router = useRouter();
  const { setUser, openDialog } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [occupation, setOccupation] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, phone, occupation }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Đã xảy ra lỗi không xác định.");
        return;
      }
      setUser(data.user);
      router.push("/");
    } catch {
      setError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-6">
      <div className="w-full max-w-5xl rounded-2xl border border-border bg-card p-7 shadow-2xl lg:p-9">
        <div className="flex items-center gap-3 border-b border-border pb-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Scale size={20} />
          </span>
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight">Tạo tài khoản</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Chỉ mất chưa đến một phút.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AuthField
              id="reg-name"
              label="Họ tên"
              type="text"
              icon={UserIcon}
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nguyễn Văn A"
            />
            <AuthField
              id="reg-phone"
              label="Số điện thoại"
              type="tel"
              icon={Phone}
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09xx xxx xxx"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AuthField
              id="reg-email"
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
              id="reg-occupation"
              label="Nghề nghiệp / Lĩnh vực"
              type="text"
              icon={Briefcase}
              autoComplete="organization-title"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="Luật sư, tài xế, sinh viên..."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AuthField
              id="reg-password"
              label="Mật khẩu"
              type="password"
              icon={Lock}
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 8 ký tự"
            />
            <AuthField
              id="reg-password-confirm"
              label="Xác nhận mật khẩu"
              type="password"
              icon={Lock}
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="mt-1 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Bằng việc tạo tài khoản, bạn đồng ý với Điều khoản sử dụng và Chính sách bảo mật.
            </p>
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-primary px-8 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? "Đang xử lý..." : "Tạo tài khoản"}
            </button>
          </div>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Đã có tài khoản?{" "}
          <button type="button" onClick={openDialog} className="font-medium text-primary hover:underline">
            Đăng nhập
          </button>{" "}
          ·{" "}
          <Link href="/" className="hover:text-foreground hover:underline">
            Về trang chủ
          </Link>
        </p>
      </div>
    </div>
  );
}
