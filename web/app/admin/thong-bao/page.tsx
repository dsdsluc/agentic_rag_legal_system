import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AnnouncementForm } from "@/components/admin/AnnouncementForm";

export const metadata = { title: "Quản trị · Thông báo" };

export default async function AdminAnnouncementPage() {
  const row = await prisma.siteAnnouncement.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8 lg:px-10 lg:py-10">
      <AdminPageHeader
        title="Thông báo"
        subtitle="Nội dung hiển thị ở khu vực thông báo, phía chat và Legal Workspace — admin không thấy khu vực này."
      />
      <AnnouncementForm
        initial={{
          message: row.message,
          active: row.active,
          apiEnabled: row.apiEnabled,
          professionalModeEnabled: row.professionalModeEnabled,
          updatedAt: row.updatedAt.toISOString(),
        }}
      />
    </div>
  );
}
