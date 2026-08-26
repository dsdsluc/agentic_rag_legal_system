import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isChatOwner, resolveChatOwner } from "@/lib/chatOwner";

// Full hydration of one conversation — called once when a client opens
// /c/[id] and doesn't already have it in memory (fresh load or a refresh),
// never on every chat turn.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await resolveChatOwner();

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation || !isChatOwner(conversation, owner)) {
    return NextResponse.json({ error: "Không tìm thấy cuộc trò chuyện." }, { status: 404 });
  }

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      mode: conversation.mode,
      updatedAt: conversation.updatedAt.toISOString(),
      messages: conversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        mode: m.mode,
        sources: m.sourcesJson ?? undefined,
        domains: m.domains,
      })),
    },
  });
}
