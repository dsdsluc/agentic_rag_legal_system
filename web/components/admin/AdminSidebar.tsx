"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  CircleDollarSign,
  FileWarning,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  MessagesSquare,
  ShieldCheck,
  StickyNote,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Tổng quan",
    items: [{ href: "/admin", label: "Tổng quan", icon: LayoutDashboard }],
  },
  {
    label: "Quản lý người dùng",
    items: [
      { href: "/admin/users", label: "Danh sách", icon: Users },
      { href: "/admin/users/roles", label: "Phân quyền", icon: ShieldCheck },
      { href: "/admin/users/sessions", label: "Phiên đăng nhập", icon: KeyRound },
      { href: "/admin/users/activity", label: "Hoạt động", icon: Activity },
    ],
  },
  {
    label: "Nội dung pháp luật",
    items: [{ href: "/admin/content-review", label: "Rà soát OCR", icon: FileWarning }],
  },
  {
    label: "Vận hành",
    items: [
      { href: "/admin/thong-bao", label: "Thông báo", icon: Bell },
      { href: "/admin/ghi-chu", label: "Ghi chú", icon: StickyNote },
      { href: "/admin/chi-phi", label: "Chi phí & Token", icon: CircleDollarSign },
      { href: "/admin/tinh-trang", label: "Tình trạng hệ thống", icon: HeartPulse },
    ],
  },
  {
    label: "Giám sát",
    items: [{ href: "/admin/hoi-thoai", label: "Hội thoại", icon: MessagesSquare }],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <ShieldCheck size={18} />
        </span>
        <span className="font-heading text-[15px] font-semibold">Quản trị hệ thống</span>
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pt-4 pb-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-sidebar-foreground/50 uppercase">
              {group.label}
            </p>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                        : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                    )}
                  >
                    <item.icon size={19} className="shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
