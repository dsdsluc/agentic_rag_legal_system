"use client";

import { ChevronDown, Lock, Scale, User } from "lucide-react";
import { AnswerMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-client";
import { useAnnouncement } from "@/lib/announcement";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/ui/menu";

const OPTIONS: { mode: AnswerMode; label: string; caption: string; icon: typeof User }[] = [
  { mode: "citizen", label: "Người dân", caption: "Giải thích đơn giản, dễ hiểu", icon: User },
  {
    mode: "professional",
    label: "Chuyên gia",
    caption: "Trích dẫn đầy đủ Luật, Nghị định, Điều, Khoản, Điểm",
    icon: Scale,
  },
];

export function ModeBubble({
  mode,
  onChange,
  className,
}: {
  mode: AnswerMode;
  onChange: (mode: AnswerMode) => void;
  className?: string;
}) {
  const { user, openDialog } = useAuth();
  const { announcement } = useAnnouncement();
  // Fails open (treated as enabled) while the fetch is still in flight or
  // failed — same "assume enabled" fallback as apiEnabled elsewhere, so a
  // slow/flaky /api/announcement never blocks a mode that's actually on.
  const professionalDisabled = announcement?.professionalModeEnabled === false;
  const active = OPTIONS.find((o) => o.mode === mode)!;
  const Icon = active.icon;

  function handleValueChange(value: AnswerMode) {
    if (value === "professional" && professionalDisabled) {
      // Admin-disabled takes precedence over the login gate below — logging
      // in wouldn't unlock it, so showing that dialog here would mislead.
      return;
    }
    if (value === "professional" && !user) {
      // Login, not registration — most people hitting this are returning
      // users who forgot to sign in, not new visitors (same reasoning as
      // VanBanLockedScreen). Registration is still one click away from the
      // dialog itself.
      openDialog();
      return;
    }
    onChange(value);
  }

  return (
    <Menu>
      <MenuTrigger
        className={cn(
          "group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur-md transition-colors",
          mode === "citizen"
            ? "border-citizen/25 bg-citizen-soft/60 text-citizen-foreground hover:bg-citizen-soft/80"
            : "border-professional/25 bg-professional-soft/60 text-professional-foreground hover:bg-professional-soft/80",
          className
        )}
      >
        <Icon size={13} />
        {active.label}
        <ChevronDown size={12} className="opacity-60 transition-transform group-aria-expanded:rotate-180" />
      </MenuTrigger>
      <MenuContent side="bottom" align="end" className="w-64">
        <MenuRadioGroup value={mode} onValueChange={(value) => handleValueChange(value as AnswerMode)}>
          {OPTIONS.map((option) => {
            const isProfessional = option.mode === "professional";
            const locked = isProfessional && (professionalDisabled || !user);
            const lockCaption = professionalDisabled
              ? "Tạm khoá bởi quản trị viên"
              : "Đăng nhập để mở khoá chế độ này";
            return (
              <MenuRadioItem key={option.mode} value={option.mode} className="items-start">
                <span className="flex flex-1 flex-col gap-0.5 py-0.5">
                  <span className="flex items-center gap-1.5 font-medium">
                    <option.icon size={13} className="shrink-0" />
                    {option.label}
                    {locked && <Lock size={11} className="ml-auto shrink-0 text-muted-foreground" />}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {locked ? lockCaption : option.caption}
                  </span>
                </span>
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
