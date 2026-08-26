import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminAccountMenu } from "@/components/admin/AdminAccountMenu";
import { AdminForbiddenScreen } from "@/components/admin/AdminForbiddenScreen";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (user?.role !== "admin") return <AdminForbiddenScreen />;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <AdminSidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      <AdminAccountMenu />
    </div>
  );
}
