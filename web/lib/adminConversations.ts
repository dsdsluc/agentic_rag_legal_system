import { prisma } from "./prisma";

export interface AdminConversationRow {
  id: string;
  title: string;
  mode: "citizen" | "professional";
  ownerLabel: string;
  ownerEmail: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

// Bounded, not paginated at the query level (matches loadUserRows' style) —
// QA/moderation browsing needs recency, not the full archive; a hard cap
// keeps this cheap without needing real pagination for what's a low-traffic
// admin-only listing.
const MAX_ROWS = 300;

export async function loadConversationRows(): Promise<AdminConversationRow[]> {
  const conversations = await prisma.conversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: MAX_ROWS,
    select: {
      id: true,
      title: true,
      mode: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { name: true, email: true } },
      _count: { select: { messages: true } },
    },
  });

  return conversations.map((c) => ({
    id: c.id,
    title: c.title,
    mode: c.mode,
    ownerLabel: c.user?.name ?? "Khách (ẩn danh)",
    ownerEmail: c.user?.email ?? null,
    messageCount: c._count.messages,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
}
