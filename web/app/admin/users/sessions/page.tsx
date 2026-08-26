import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SessionGroups, type UserSessionGroup } from "@/components/admin/SessionGroups";

export const metadata = { title: "Quản trị · Phiên đăng nhập" };

// Plain helper (not the page component itself) so the "now" snapshot used
// to mark each session active/expired doesn't read as an impure call
// inside a component's render body.
async function loadSessionGroups(): Promise<UserSessionGroup[]> {
  const sessions = await prisma.session.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  const now = Date.now();
  const groups = new Map<string, UserSessionGroup>();
  for (const s of sessions) {
    if (!groups.has(s.userId)) {
      groups.set(s.userId, { userId: s.userId, userName: s.user.name, userEmail: s.user.email, sessions: [] });
    }
    groups.get(s.userId)!.sessions.push({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      active: s.expiresAt.getTime() > now,
    });
  }
  return Array.from(groups.values());
}

export default async function AdminSessionsPage() {
  const groups = await loadSessionGroups();
  const total = groups.reduce((sum, g) => sum + g.sessions.length, 0);
  const activeTotal = groups.reduce((sum, g) => sum + g.sessions.filter((s) => s.active).length, 0);

  return (
    <div className="w-full px-6 py-6 lg:px-8">
      <AdminPageHeader title="Phiên đăng nhập" subtitle={`${activeTotal} phiên còn hiệu lực trên tổng số ${total}`} />
      <div className="mt-5">
        {groups.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Chưa có phiên đăng nhập nào.
          </p>
        ) : (
          <SessionGroups groups={groups} />
        )}
      </div>
    </div>
  );
}
