import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, MessageSquareText, User } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ChatBubble } from "@/components/ChatBubble";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

export const metadata = { title: "Quản trị · Chi tiết hội thoại" };

export default async function AdminConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!conversation) notFound();

  const messages: ChatMessage[] = conversation.messages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    text: m.text,
    mode: m.mode,
    sources: (m.sourcesJson as unknown as ChatMessage["sources"]) ?? undefined,
  }));

  const ownerLabel = conversation.user ? conversation.user.name : "Khách (ẩn danh)";
  const isProfessional = conversation.mode === "professional";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-6 py-10 lg:px-10 lg:py-12">
        <Link
          href="/admin/hoi-thoai"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Danh sách hội thoại
        </Link>

        <div className="mt-5 rounded-2xl border border-border bg-card p-6 shadow-sm lg:p-8">
          <h1 className="font-serif text-3xl leading-tight font-semibold tracking-tight text-balance">
            {conversation.title}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
              <User size={13} className="text-muted-foreground" />
              {ownerLabel}
              {conversation.user && <span className="text-muted-foreground">· {conversation.user.email}</span>}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
                isProfessional
                  ? "bg-professional-soft text-professional-foreground ring-professional/20"
                  : "bg-citizen-soft text-citizen-foreground ring-citizen/20"
              )}
            >
              {isProfessional ? "Chế độ Chuyên gia" : "Chế độ Người dân"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
              <MessageSquareText size={13} className="text-muted-foreground" />
              {messages.length} tin nhắn
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              <Clock size={13} />
              Cập nhật {conversation.updatedAt.toLocaleString("vi-VN")}
            </span>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border/70 bg-muted/20 p-6 lg:p-8">
          <div className="flex flex-col gap-6">
            {messages.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">Hội thoại này chưa có tin nhắn nào.</p>
            )}
            {messages.map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
