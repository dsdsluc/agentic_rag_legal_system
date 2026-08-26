"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AdminPageHeader } from "./AdminPageHeader";
import { UserTable, type AdminUserRow } from "./UserTable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type RoleFilter = "all" | "user" | "admin";
type StatusFilter = "all" | "active" | "locked";

const ROLE_LABELS: Record<RoleFilter, string> = { all: "Tất cả vai trò", user: "User", admin: "Admin" };
const STATUS_LABELS: Record<StatusFilter, string> = { all: "Tất cả trạng thái", active: "Đang hoạt động", locked: "Đã khóa" };

export function UsersPageClient({ rows }: { rows: AdminUserRow[] }) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) return false;
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      if (statusFilter === "active" && r.isLocked) return false;
      if (statusFilter === "locked" && !r.isLocked) return false;
      return true;
    });
  }, [rows, query, roleFilter, statusFilter]);

  return (
    <div className="w-full px-6 py-6 lg:px-8">
      <AdminPageHeader
        title="Danh sách người dùng"
        subtitle={`${filtered.length} / ${rows.length} tài khoản`}
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
              <Search size={13} className="shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo tên hoặc email…"
                className="w-44 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
              <SelectTrigger size="sm" className="bg-card">
                <SelectValue>{(v: RoleFilter) => ROLE_LABELS[v]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả vai trò</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger size="sm" className="bg-card">
                <SelectValue>{(v: StatusFilter) => STATUS_LABELS[v]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                <SelectItem value="active">Đang hoạt động</SelectItem>
                <SelectItem value="locked">Đã khóa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />
      <div className="mt-5">
        <UserTable rows={filtered} />
      </div>
    </div>
  );
}
