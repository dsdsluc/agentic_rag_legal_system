"use client";

import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogIn, LogOut, Settings, ShieldCheck, User, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-client";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";

export function SidebarAccount({ collapsed }: { collapsed: boolean }) {
  const { user, openDialog, logout } = useAuth();
  const router = useRouter();

  return (
    <Menu>
      <MenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sidebar-accent",
          collapsed && "md:justify-center md:px-0"
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold shadow-sm",
            user ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {user ? user.name.charAt(0).toUpperCase() : <User size={15} />}
        </span>
        <span className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
          <span className="block truncate text-sm font-medium">{user ? user.name : "Khách"}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {user ? user.email : "Chưa đăng nhập"}
          </span>
        </span>
        <ChevronsUpDown size={14} className={cn("shrink-0 text-muted-foreground", collapsed && "md:hidden")} />
      </MenuTrigger>
      <MenuContent side="top" align="start" className="w-64">
        {user ? (
          <>
            <div className="px-2.5 py-1.5">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
            <MenuSeparator />
            <MenuItem onClick={() => router.push("/tai-khoan")}>
              <Settings size={14} />
              Tài khoản của tôi
            </MenuItem>
            {user.role === "admin" && (
              <MenuItem onClick={() => router.push("/admin")}>
                <ShieldCheck size={14} />
                Quản trị hệ thống
              </MenuItem>
            )}
            <MenuItem onClick={() => void logout()}>
              <LogOut size={14} />
              Đăng xuất
            </MenuItem>
          </>
        ) : (
          <>
            <MenuItem onClick={() => openDialog()}>
              <LogIn size={14} />
              Đăng nhập
            </MenuItem>
            <MenuItem onClick={() => router.push("/dang-ky")}>
              <UserPlus size={14} />
              Tạo tài khoản
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
