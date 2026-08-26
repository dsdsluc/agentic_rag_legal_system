"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnswerMode, ChatHistoryItem, DomainSelection } from "@/lib/types";
import { useChatStore } from "@/lib/chat-store";
import { useAuth } from "@/lib/auth-client";
import { ChatBubble } from "./ChatBubble";
import { ChatInput } from "./ChatInput";
import { ModeBubble } from "./ModeBubble";
import { LegalWorkspaceLink } from "./LegalWorkspaceLink";

export function ConversationView({ conversation }: { conversation: ChatHistoryItem }) {
  const router = useRouter();
  const { startConversationFrom } = useChatStore();
  const { user, openDialog } = useAuth();
  // Seeded from the sample's own mode, which can be "professional" — that's
  // fine for viewing (static demo content), but continuing it with a real
  // query has to pass the same login gate ModeBubble enforces everywhere
  // else, or a guest could ride a professional-mode sample straight past it.
  const [mode, setMode] = useState<AnswerMode>(conversation.mode);
  const [domain, setDomain] = useState<DomainSelection>("auto");
  const [pending, setPending] = useState(false);

  function handleSend(text: string) {
    if (mode === "professional" && !user) {
      openDialog();
      return;
    }
    setPending(true);
    const id = startConversationFrom(conversation.title, mode, domain, conversation.messages, text);
    router.push(`/c/${id}`);
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex justify-end gap-2 px-4 pt-4 md:px-6">
        <LegalWorkspaceLink />
        <ModeBubble mode={mode} onChange={setMode} />
      </div>

      <div className="mx-auto flex w-full max-w-2xl xl:max-w-3xl flex-1 flex-col overflow-hidden px-4">
        <header className="flex flex-col items-center gap-1 pt-2 pb-3 text-center">
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            Xem lại cuộc trò chuyện · dữ liệu mẫu
          </span>
          <h1 className="font-heading text-lg font-semibold tracking-tight">{conversation.title}</h1>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-3 py-4">
            {conversation.messages.map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
          </div>
        </div>

        <div className="sticky bottom-0 bg-background/85 pb-6 pt-2 backdrop-blur">
          <ChatInput onSend={handleSend} disabled={pending} domain={domain} onDomainChange={setDomain} />
        </div>
      </div>
    </div>
  );
}
