import { UserPlus, LogIn, MessagesSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const metadata = { title: "Quản trị · Hoạt động" };

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffMin < 24 * 60) return `${Math.round(diffMin / 60)} giờ trước`;
  return `${Math.round(diffMin / (24 * 60))} ngày trước`;
}

export default async function AdminActivityPage() {
  const [recentUsers, recentSessions, topByConversations] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, email: true, createdAt: true },
    }),
    prisma.session.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.user.findMany({
      orderBy: { conversations: { _count: "desc" } },
      take: 8,
      select: { id: true, name: true, email: true, _count: { select: { conversations: true } } },
    }),
  ]);

  return (
    <div className="w-full px-6 py-6 lg:px-8">
      <AdminPageHeader title="Hoạt động" subtitle="Tổng hợp nhanh từ dữ liệu thật — chưa phải analytics đầy đủ" />

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <UserPlus size={15} className="text-professional-foreground" />
            <h2 className="font-serif text-sm font-semibold">Đăng ký gần đây</h2>
          </div>
          <ul className="flex flex-col divide-y divide-border/70">
            {recentUsers.map((u) => (
              <li key={u.id} className="px-4 py-2.5">
                <p className="truncate text-sm font-medium">{u.name}</p>
                <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{u.email}</span>
                  <span className="shrink-0">{relativeTime(u.createdAt.toISOString())}</span>
                </p>
              </li>
            ))}
            {recentUsers.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted-foreground">Chưa có dữ liệu.</li>}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <LogIn size={15} className="text-citizen-foreground" />
            <h2 className="font-serif text-sm font-semibold">Đăng nhập gần đây</h2>
          </div>
          <ul className="flex flex-col divide-y divide-border/70">
            {recentSessions.map((s) => (
              <li key={s.id} className="px-4 py-2.5">
                <p className="truncate text-sm font-medium">{s.user.name}</p>
                <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{s.user.email}</span>
                  <span className="shrink-0">{relativeTime(s.createdAt.toISOString())}</span>
                </p>
              </li>
            ))}
            {recentSessions.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted-foreground">Chưa có dữ liệu.</li>}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <MessagesSquare size={15} className="text-destructive" />
            <h2 className="font-serif text-sm font-semibold">Hoạt động nhiều nhất</h2>
          </div>
          <ul className="flex flex-col divide-y divide-border/70">
            {topByConversations.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground/80">
                  {u._count.conversations}
                </span>
              </li>
            ))}
            {topByConversations.length === 0 && (
              <li className="px-4 py-6 text-center text-xs text-muted-foreground">Chưa có dữ liệu.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
