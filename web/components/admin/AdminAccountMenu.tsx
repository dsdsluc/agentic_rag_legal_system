"use client";

import { useRouter } from "next/navigation";
import { LogOut, MessageSquare, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth-client";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";

// Fixed top-right across every admin page (mounted once in admin/layout.tsx)
// — replaces the old always-visible "name / email" block that used to sit
// at the bottom of AdminSidebar, freeing that footer space for actual
// sidebar functions instead of static identity display.
export function AdminAccountMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;

  return (
    <div className="fixed top-5 right-5 z-40">
      <Menu>
        <MenuTrigger
          aria-label="Tài khoản quản trị"
          className="flex items-center rounded-2xl border border-border bg-card p-1.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-10px_rgba(0,0,0,0.25)]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {user.name.charAt(0).toUpperCase()}
          </span>
        </MenuTrigger>
        <MenuContent side="bottom" align="end" className="w-60">
          <div className="px-2.5 py-1.5">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <MenuSeparator />
          <MenuItem onClick={() => router.push("/tai-khoan")}>
            <Settings size={14} />
            Tài khoản của tôi
          </MenuItem>
          <MenuItem onClick={() => router.push("/")}>
            <MessageSquare size={14} />
            Về trang trò chuyện
          </MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => void logout()}>
            <LogOut size={14} />
            Đăng xuất
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}
