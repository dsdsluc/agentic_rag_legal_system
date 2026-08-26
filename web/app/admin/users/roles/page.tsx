import { loadUserRows } from "@/lib/adminUsers";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { RoleTable } from "@/components/admin/RoleTable";

export const metadata = { title: "Quản trị · Phân quyền" };

export default async function AdminUserRolesPage() {
  const rows = await loadUserRows();
  const adminCount = rows.filter((r) => r.role === "admin").length;
  const editorCount = rows.filter((r) => r.canEditLegalDocs).length;

  return (
    <div className="w-full px-6 py-6 lg:px-8">
      <AdminPageHeader
        title="Phân quyền"
        subtitle={`${adminCount} quản trị viên · ${editorCount} người có quyền sửa Legal Workspace`}
      />
      <div className="mt-5">
        <RoleTable rows={rows} />
      </div>
    </div>
  );
}
