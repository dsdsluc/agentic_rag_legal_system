"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnswerMode, ChatMessage, ChatTurn, DomainSelection } from "./types";
import { ApiError, getAnnouncement, getConversation, postQuery, reportQueryTelemetry, syncConversation } from "./api";
import { uid } from "./id";
import { useAuth } from "./auth-client";

// Shown when an admin has switched off the FastAPI connection (out of
// tokens, or mid-deploy) but left the announcement message blank — the
// admin form blocks saving that combo, but this is the safety net if the
// row was ever edited another way.
const DEFAULT_MAINTENANCE_MESSAGE = "Hệ thống tạm ngừng trả lời tự động. Vui lòng quay lại sau.";

export interface LiveConversation {
  id: string;
  title: string;
  mode: AnswerMode;
  // Session-local only — not persisted to Postgres (Conversation has no
  // domain column, unlike mode). Defaults to "auto" for anything hydrated
  // from history, so past conversations just resume in Auto rather than
  // losing the field entirely.
  domain: DomainSelection;
  messages: ChatMessage[];
  createdAt: string;
}

// How many prior turns to send back for follow-up condensing — bounds
// prompt growth in long conversations rather than sending the whole
// history every time. Independent of DB persistence: this is the client's
// in-memory context window for the LLM call, not a storage limit.
const HISTORY_TURNS = 4;

function buildHistory(msgs: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (let i = 0; i < msgs.length - 1; i++) {
    const cur = msgs[i];
    const next = msgs[i + 1];
    if (cur.role === "user" && next.role === "assistant" && next.text && !next.pending && !next.error) {
      turns.push({ question: cur.text, answer: next.text });
    }
  }
  return turns.slice(-HISTORY_TURNS);
}

function titleFromText(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
}

function toSyncInput(m: ChatMessage) {
  return { role: m.role, text: m.text, mode: m.mode, sources: m.sources, usage: m.usage, domains: m.domains };
}

interface ChatStoreValue {
  conversations: Record<string, LiveConversation>;
  ensureConversation: (id: string, mode: AnswerMode) => void;
  startConversation: (mode: AnswerMode, domain: DomainSelection, firstMessage: string) => string;
  startConversationFrom: (
    title: string,
    mode: AnswerMode,
    domain: DomainSelection,
    priorMessages: ChatMessage[],
    nextMessage: string
  ) => string;
  sendMessage: (id: string, text: string) => void;
  setConversationMode: (id: string, mode: AnswerMode) => void;
  setConversationDomain: (id: string, domain: DomainSelection) => void;
}

const ChatStoreContext = createContext<ChatStoreValue | null>(null);

// Session-scoped store for live (API-backed) conversations, kept in a
// provider above both `/` and `/c/[id]` so switching routes doesn't lose
// in-flight state. The in-memory messages here are the source of truth for
// what gets sent to the LLM each turn — Postgres (via lib/api.ts's
// conversation endpoints) is only for durability across refreshes/devices,
// written best-effort after each answer and read back exactly once, when a
// conversation isn't already in memory (see ensureConversation). See
// plans/plan.txt for the full design rationale.
export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Record<string, LiveConversation>>({});

  // Guards against another identity's conversations lingering after login/
  // logout/account-switch: in-memory conversations here aren't tied to who's
  // signed in, so without this a conversation loaded under one account would
  // still be sitting in state (and rendered in the sidebar) after switching
  // to another. `undefined` means "not yet resolved" — skip clearing on the
  // very first resolution (nothing to clear yet, and it would just wipe a
  // conversation started before /api/auth/me finished loading).
  const { user, loading: authLoading } = useAuth();
  const prevIdentityRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (authLoading) return;
    const identity = user?.id ?? null;
    if (prevIdentityRef.current !== undefined && prevIdentityRef.current !== identity) {
      setConversations({});
    }
    prevIdentityRef.current = identity;
  }, [user, authLoading]);

  // `seedMessages` only applies to the very first turn of a conversation
  // that was forked from a static sample (startConversationFrom) — those
  // prior messages have never been persisted, so the first sync call has to
  // carry them too or a later refresh would hydrate a shorter transcript
  // than what the user actually saw.
  async function runQuery(
    id: string,
    mode: AnswerMode,
    domain: DomainSelection,
    text: string,
    historyBefore: ChatMessage[],
    title: string,
    userMessage: ChatMessage,
    seedMessages: ChatMessage[] = []
  ) {
    const history = buildHistory(historyBefore);
    const pendingId = uid();
    setConversations((prev) => {
      const convo = prev[id];
      if (!convo) return prev;
      return {
        ...prev,
        [id]: {
          ...convo,
          messages: [...convo.messages, { id: pendingId, role: "assistant", text: "", mode, pending: true }],
        },
      };
    });

    try {
      const announcement = await getAnnouncement();
      let assistantMessage: ChatMessage;
      if (announcement && !announcement.apiEnabled) {
        assistantMessage = {
          id: pendingId,
          role: "assistant",
          text: announcement.message.trim() || DEFAULT_MAINTENANCE_MESSAGE,
          mode,
        };
      } else if (mode === "professional" && announcement?.professionalModeEnabled === false) {
        // Blocks sends in an ALREADY-professional conversation too, not just
        // new mode selection (ModeBubble's own gate) — an admin turning this
        // off mid-session (cost control) has to actually stop the higher-
        // token-budget calls, not just hide the picker for future ones.
        assistantMessage = {
          id: pendingId,
          role: "assistant",
          text: "Chế độ Chuyên gia hiện đang tạm khoá bởi quản trị viên. Vui lòng chuyển sang chế độ Người dân hoặc quay lại sau.",
          mode,
        };
      } else {
        // Timed and reported regardless of outcome — the only place a
        // failed /query is ever recorded anywhere (see reportQueryTelemetry
        // in lib/api.ts), since this catch re-throws to the outer one below
        // which only updates the UI, never persists.
        const startedAt = performance.now();
        try {
          const result = await postQuery({ question: text, mode, domain: domain === "auto" ? null : domain, history });
          void reportQueryTelemetry({
            conversationId: id,
            mode,
            success: true,
            latencyMs: Math.round(performance.now() - startedAt),
          });
          assistantMessage = {
            id: pendingId,
            role: "assistant",
            text: result.answer,
            sources: result.sources,
            usage: result.usage,
            domains: result.domains,
            mode,
          };
        } catch (err) {
          void reportQueryTelemetry({
            conversationId: id,
            mode,
            success: false,
            statusCode: err instanceof ApiError ? err.status : undefined,
            errorMessage: err instanceof ApiError ? err.message : "unknown error",
            latencyMs: Math.round(performance.now() - startedAt),
          });
          throw err;
        }
      }
      setConversations((prev) => {
        const convo = prev[id];
        if (!convo) return prev;
        return {
          ...prev,
          [id]: {
            ...convo,
            messages: convo.messages.map((m) => (m.id === pendingId ? assistantMessage : m)),
          },
        };
      });
      void syncConversation({
        conversationId: id,
        title,
        mode,
        newMessages: [...seedMessages, userMessage, assistantMessage].map(toSyncInput),
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Đã xảy ra lỗi không xác định.";
      setConversations((prev) => {
        const convo = prev[id];
        if (!convo) return prev;
        return {
          ...prev,
          [id]: {
            ...convo,
            messages: convo.messages.map((m) => (m.id === pendingId ? { ...m, pending: false, error: message } : m)),
          },
        };
      });
      // Errored turns aren't persisted (see plans/plan.txt §3) — the user
      // sees the error inline, nothing useful to resume from later.
    }
  }

  async function ensureConversation(id: string, mode: AnswerMode) {
    if (conversations[id]) return;

    const hydrated = await getConversation(id);
    setConversations((prev) => {
      if (prev[id]) return prev;
      if (hydrated) {
        return {
          ...prev,
          [id]: {
            id: hydrated.id,
            title: hydrated.title,
            mode: hydrated.mode,
            domain: "auto",
            messages: hydrated.messages,
            createdAt: hydrated.updatedAt,
          },
        };
      }
      return {
        ...prev,
        [id]: { id, title: "Cuộc trò chuyện mới", mode, domain: "auto", messages: [], createdAt: new Date().toISOString() },
      };
    });
  }

  function startConversation(mode: AnswerMode, domain: DomainSelection, firstMessage: string): string {
    const id = uid();
    const title = titleFromText(firstMessage);
    const userMessage: ChatMessage = { id: uid(), role: "user", text: firstMessage, mode };
    setConversations((prev) => ({
      ...prev,
      [id]: { id, title, mode, domain, messages: [userMessage], createdAt: new Date().toISOString() },
    }));
    void runQuery(id, mode, domain, firstMessage, [], title, userMessage);
    return id;
  }

  // Picking up a sample (MOCK_HISTORY) transcript from where it left off —
  // that transcript is static demo data, not a real stored conversation,
  // so continuing it forks a brand-new live conversation seeded with the
  // messages the user already saw, rather than trying to mutate the
  // read-only sample in place.
  function startConversationFrom(
    title: string,
    mode: AnswerMode,
    domain: DomainSelection,
    priorMessages: ChatMessage[],
    nextMessage: string
  ): string {
    const id = uid();
    const userMessage: ChatMessage = { id: uid(), role: "user", text: nextMessage, mode };
    setConversations((prev) => ({
      ...prev,
      [id]: { id, title, mode, domain, messages: [...priorMessages, userMessage], createdAt: new Date().toISOString() },
    }));
    void runQuery(id, mode, domain, nextMessage, priorMessages, title, userMessage, priorMessages);
    return id;
  }

  function sendMessage(id: string, text: string) {
    const convo = conversations[id];
    if (!convo) return;
    const historyBefore = convo.messages;
    const title = convo.messages.length === 0 ? titleFromText(text) : convo.title;
    const userMessage: ChatMessage = { id: uid(), role: "user", text, mode: convo.mode };
    setConversations((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        title,
        messages: [...prev[id].messages, userMessage],
      },
    }));
    void runQuery(id, convo.mode, convo.domain, text, historyBefore, title, userMessage);
  }

  function setConversationMode(id: string, mode: AnswerMode) {
    setConversations((prev) => {
      const convo = prev[id];
      if (!convo) return prev;
      return { ...prev, [id]: { ...convo, mode } };
    });
  }

  function setConversationDomain(id: string, domain: DomainSelection) {
    setConversations((prev) => {
      const convo = prev[id];
      if (!convo) return prev;
      return { ...prev, [id]: { ...convo, domain } };
    });
  }

  const value = useMemo<ChatStoreValue>(
    () => ({
      conversations,
      ensureConversation,
      startConversation,
      startConversationFrom,
      sendMessage,
      setConversationMode,
      setConversationDomain,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversations]
  );

  return <ChatStoreContext.Provider value={value}>{children}</ChatStoreContext.Provider>;
}

export function useChatStore() {
  const ctx = useContext(ChatStoreContext);
  if (!ctx) throw new Error("useChatStore must be used within ChatStoreProvider");
  return ctx;
}
