import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { NoteForm } from "@/components/admin/NoteForm";

export const metadata = { title: "Quản trị · Ghi chú" };

export default async function AdminNotePage() {
  const row = await prisma.recruiterNote.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8 lg:px-10 lg:py-10">
      <AdminPageHeader
        title="Ghi chú"
        subtitle="Ghi chú công khai cho người ngoài (VD: nhà tuyển dụng test hệ thống) — hiển thị ở khu vực thông báo góc chat, không cần đăng nhập để xem."
      />
      <NoteForm
        initial={{
          message: row.message,
          active: row.active,
          updatedAt: row.updatedAt.toISOString(),
        }}
      />
    </div>
  );
}
