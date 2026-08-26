"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/lib/chat-store";
import { ChatBubble } from "./ChatBubble";
import { ChatInput } from "./ChatInput";
import { ModeBubble } from "./ModeBubble";
import { LegalWorkspaceLink } from "./LegalWorkspaceLink";

export function ChatRoom({ id }: { id: string }) {
  const { conversations, ensureConversation, sendMessage, setConversationMode, setConversationDomain } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureConversation(id, "citizen");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const conversation = conversations[id];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation?.messages]);

  if (!conversation) return null;

  const pending = conversation.messages[conversation.messages.length - 1]?.pending === true;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex justify-end gap-2 px-4 pt-4 md:px-6">
        <LegalWorkspaceLink />
        <ModeBubble mode={conversation.mode} onChange={(m) => setConversationMode(id, m)} />
      </div>

      <div className="mx-auto flex w-full max-w-2xl xl:max-w-3xl flex-1 flex-col overflow-hidden px-4">
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-3 py-4">
            {conversation.messages.map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="sticky bottom-0 bg-background/85 pb-6 pt-2 backdrop-blur">
          <ChatInput
            onSend={(text) => sendMessage(id, text)}
            disabled={pending}
            domain={conversation.domain}
            onDomainChange={(d) => setConversationDomain(id, d)}
          />
        </div>
      </div>
    </div>
  );
}
