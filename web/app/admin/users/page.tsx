import { loadUserRows } from "@/lib/adminUsers";
import { UsersPageClient } from "@/components/admin/UsersPageClient";

export const metadata = { title: "Quản trị · Người dùng" };

export default async function AdminUsersPage() {
  const rows = await loadUserRows();
  return <UsersPageClient rows={rows} />;
}
