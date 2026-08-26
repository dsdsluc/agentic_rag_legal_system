import { AnswerMode, Announcement, ChatMessage, QueryRequest, QueryResponse } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  // undefined = network/fetch-level failure (never reached the server);
  // otherwise the actual HTTP status FastAPI returned. Reported alongside
  // latency in postQuery's telemetry (see chat-store.tsx's runQuery) so the
  // admin health dashboard can tell "backend down" apart from "backend
  // rejected the request".
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

// Checked before every FastAPI call — see chat-store.tsx's runQuery. Failing
// this fetch falls back to "assume enabled" (return null), same as the
// schema default, so a hiccup here never blocks chat that would otherwise
// work fine.
export async function getAnnouncement(): Promise<Announcement | null> {
  try {
    const res = await fetch("/api/announcement");
    if (!res.ok) return null;
    const body = await res.json();
    return body.announcement ?? null;
  } catch {
    return null;
  }
}

export async function postQuery(request: QueryRequest): Promise<QueryResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new ApiError(
      "Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối và thử lại."
    );
  }

  if (!response.ok) {
    let detail = `Máy chủ trả về lỗi (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // ignore malformed error body, keep default detail
    }
    throw new ApiError(detail, response.status);
  }

  return response.json();
}

// Fire-and-forget, best-effort — telemetry recording itself must never
// throw or block the chat UI (same reasoning as syncConversation). This is
// the only place a failed /query is ever recorded anywhere: chat-store.tsx
// never persists an errored turn to Message/QueryUsage, and FastAPI only
// logs to its own stdout (see api/main.py) — nothing else queryable exists
// for the admin health dashboard to read.
export async function reportQueryTelemetry(input: {
  conversationId: string;
  mode: AnswerMode;
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
  latencyMs: number;
}): Promise<void> {
  try {
    await fetch("/api/telemetry/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    // best-effort — losing one telemetry point is never worth surfacing
  }
}

export interface ConversationSummary {
  id: string;
  title: string;
  mode: AnswerMode;
  updatedAt: string;
  preview: string;
  // Representative domain for the sidebar icon — the last assistant
  // message's resolved domains, collapsed via lib/domain.ts's
  // representativeDomain (single value, or null when genuinely ambiguous).
  domain: string | null;
}

export interface ConversationDetail {
  id: string;
  title: string;
  mode: AnswerMode;
  updatedAt: string;
  messages: ChatMessage[];
}

// History persistence is best-effort and never gates the chat UI (see
// plans/plan.txt) — these swallow network/server errors instead of
// throwing, so a flaky save never surfaces as a chat-breaking error.

export async function listConversations(): Promise<ConversationSummary[]> {
  try {
    const res = await fetch("/api/conversations");
    if (!res.ok) return [];
    const body = await res.json();
    return body.conversations ?? [];
  } catch {
    return [];
  }
}

export async function getConversation(id: string): Promise<ConversationDetail | null> {
  try {
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return null;
    const body = await res.json();
    return body.conversation ?? null;
  } catch {
    return null;
  }
}

export interface SyncMessageInput {
  role: "user" | "assistant";
  text: string;
  mode: AnswerMode;
  sources?: ChatMessage["sources"];
  usage?: ChatMessage["usage"];
  domains?: ChatMessage["domains"];
}

export async function syncConversation(input: {
  conversationId: string;
  title: string;
  mode: AnswerMode;
  newMessages: SyncMessageInput[];
}): Promise<void> {
  try {
    await fetch("/api/conversations/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    // best-effort — the answer is already on screen either way
  }
}
