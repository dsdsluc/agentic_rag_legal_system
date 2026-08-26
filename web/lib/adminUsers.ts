import { prisma } from "./prisma";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  occupation: string | null;
  role: "user" | "admin";
  canEditLegalDocs: boolean;
  isLocked: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  conversationCount: number;
  sessionCount: number;
  hasActiveSession: boolean;
}

// Shared by every /admin/users/* page (list, roles, sessions) so they read
// a consistent shape instead of each re-deriving it slightly differently.
export async function loadUserRows(): Promise<AdminUserRow[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      occupation: true,
      role: true,
      canEditLegalDocs: true,
      isLocked: true,
      createdAt: true,
      _count: { select: { conversations: true, sessions: true } },
      // Most recent session defines both "last login" and whether they're
      // currently active — ordered by createdAt (when it was issued), not
      // expiresAt, since those two only happen to move together today
      // because every session gets the same fixed TTL.
      sessions: { select: { createdAt: true, expiresAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const now = Date.now();
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    occupation: u.occupation,
    role: u.role,
    canEditLegalDocs: u.canEditLegalDocs,
    isLocked: u.isLocked,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.sessions[0]?.createdAt.toISOString() ?? null,
    conversationCount: u._count.conversations,
    sessionCount: u._count.sessions,
    hasActiveSession: (u.sessions[0]?.expiresAt.getTime() ?? 0) > now,
  }));
}
