"use client";

import { useState } from "react";
import { Briefcase, Check, KeyRound, Loader2, Mail, Phone, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { AuthField } from "@/components/AuthField";

interface ProfileInitial {
  name: string;
  email: string;
  phone: string;
  occupation: string;
}

export function AccountForm({ initial }: { initial: ProfileInitial }) {
  const { setUser } = useAuth();

  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [occupation, setOccupation] = useState(initial.occupation);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSavedAt, setProfileSavedAt] = useState<string | null>(null);
  const profileDirty = name !== initial.name || phone !== initial.phone || occupation !== initial.occupation;

  async function handleProfileSave() {
    setProfileSaving(true);
    setProfileError(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, occupation }),
      });
      const body = await res.json();
      if (!res.ok) {
        setProfileError(body.error ?? "Lưu thất bại.");
        return;
      }
      setUser(body.user);
      setProfileSavedAt(new Date().toLocaleTimeString("vi-VN"));
    } catch {
      setProfileError("Không thể kết nối tới máy chủ.");
    } finally {
      setProfileSaving(false);
    }
  }

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  async function handlePasswordSave() {
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword.length < 8) {
      setPasswordError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setPasswordSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPasswordError(body.error ?? "Đổi mật khẩu thất bại.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess(true);
    } catch {
      setPasswordError("Không thể kết nối tới máy chủ.");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Tài khoản của tôi</h1>
        <p className="mt-1 text-sm text-muted-foreground">Cập nhật thông tin cá nhân và mật khẩu đăng nhập.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
      <div className="min-w-0 rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">Thông tin cá nhân</h2>
        <div className="mt-4 flex flex-col gap-4">
          <AuthField id="account-email" label="Email" type="email" icon={Mail} value={initial.email} readOnly />
          <AuthField
            id="account-name"
            label="Họ tên"
            type="text"
            icon={UserIcon}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
          <AuthField
            id="account-phone"
            label="Số điện thoại"
            type="tel"
            icon={Phone}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={20}
            placeholder="09xx xxx xxx"
          />
          <AuthField
            id="account-occupation"
            label="Nghề nghiệp / Lĩnh vực"
            type="text"
            icon={Briefcase}
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            maxLength={100}
            placeholder="Luật sư, tài xế, sinh viên..."
          />
        </div>
        {profileError && <p className="mt-3 text-sm text-destructive">{profileError}</p>}
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={handleProfileSave} disabled={profileSaving || !profileDirty || !name.trim()}>
            {profileSaving && <Loader2 size={14} className="animate-spin" />}
            Lưu thay đổi
          </Button>
          {!profileDirty && profileSavedAt && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check size={13} className="text-chart-3" /> Đã lưu lúc {profileSavedAt}
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0 rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">Đổi mật khẩu</h2>
        <div className="mt-4 flex flex-col gap-4">
          <AuthField
            id="account-current-password"
            label="Mật khẩu hiện tại"
            type="password"
            icon={KeyRound}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <AuthField
            id="account-new-password"
            label="Mật khẩu mới"
            type="password"
            icon={KeyRound}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Tối thiểu 8 ký tự"
          />
          <AuthField
            id="account-confirm-password"
            label="Xác nhận mật khẩu mới"
            type="password"
            icon={KeyRound}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        {passwordError && <p className="mt-3 text-sm text-destructive">{passwordError}</p>}
        {passwordSuccess && (
          <p className="mt-3 flex items-center gap-1 text-sm text-foreground">
            <Check size={13} className="text-chart-3" /> Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.
          </p>
        )}
        <div className="mt-4">
          <Button
            onClick={handlePasswordSave}
            disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
          >
            {passwordSaving && <Loader2 size={14} className="animate-spin" />}
            Đổi mật khẩu
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}
