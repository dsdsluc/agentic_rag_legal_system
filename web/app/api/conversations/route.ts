import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveChatOwner } from "@/lib/chatOwner";
import { representativeDomain } from "@/lib/domain";

// Cheap sidebar listing — metadata + last-message preview only, never the
// full message bodies, so it's safe to refetch on every sidebar mount.
export async function GET() {
  const owner = await resolveChatOwner();
  const where = owner.userId ? { userId: owner.userId } : { guestId: owner.guestId };

  const conversations = await prisma.conversation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      mode: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        // >1 on purpose: the single most-recent row by createdAt isn't
        // reliably the assistant's reply — a synced turn's user+assistant
        // rows land in the same createMany call, so ordering between them
        // isn't guaranteed. A small window lets the mapping below pick the
        // last ASSISTANT message specifically for domain (only assistant
        // messages ever carry one), while preview keeps its original
        // role-agnostic "most recent" behavior.
        take: 4,
        select: { role: true, text: true, domains: true },
      },
    },
  });

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      mode: c.mode,
      updatedAt: c.updatedAt.toISOString(),
      preview: c.messages[0]?.text ?? "",
      domain: representativeDomain(c.messages.find((m) => m.role === "assistant")?.domains),
    })),
  });
}
