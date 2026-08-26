export type AnswerMode = "citizen" | "professional";

// "auto" (default) lets the backend's classify_domains() detect the
// relevant domain(s) from the question itself — see lib/domain.ts for the
// 3 concrete values' display metadata. A manual pick skips that
// classification call entirely and scopes retrieval to just that domain.
export type DomainSelection = "auto" | "giao_thong" | "dan_su" | "hinh_su";

export interface SourceOut {
  chunk_id: string;
  doc_id: string;
  doc_title: string;
  doc_type: string;
  article_number: number | null;
  article_heading: string;
  chunk_type: string;
  needs_review: boolean;
  is_amendment_context: boolean;
  amends_doc_id: string | null;
  score: number;
}

export interface ChatTurn {
  question: string;
  answer: string;
}

export interface QueryRequest {
  question: string;
  history?: ChatTurn[];
  top_k?: number;
  mode: AnswerMode;
  // Omit (or null) for "auto" — the FastAPI backend treats a missing value
  // as "run the classifier". Only sent as one of the 3 concrete values when
  // the user manually picked one.
  domain?: "giao_thong" | "dan_su" | "hinh_su" | null;
}

// One LLM call within a /query request — see src/rag/usage.py. `stage` is
// one of query_rewrite/condense_question/khoan_select/relevance_filter/
// generate/generate_agent/reflection; a single request can trigger several.
export interface UsageEvent {
  stage: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  breakdown: UsageEvent[];
}

export interface QueryResponse {
  answer: string;
  sources: SourceOut[];
  mode: AnswerMode;
  condensed_question?: string | null;
  usage: Usage;
  // Resolved domain(s) the backend actually scoped retrieval to — the
  // "verification" list: what the system understood the question to be
  // about, whether from the user's manual pick or auto-classification. All
  // 3 present means no filter was applied (ambiguous or cross-domain).
  domains?: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  mode: AnswerMode;
  sources?: SourceOut[];
  usage?: Usage;
  // Set on assistant messages only — the resolved domains this turn's
  // answer was scoped to (see QueryResponse.domains).
  domains?: string[];
  pending?: boolean;
  error?: string;
}

// Sidebar conversation history. Guests are the overwhelming majority of
// traffic and nothing is persisted for them yet, so this is sample data
// shaping the UI ahead of a real history backend — see ChatSidebar.
export interface ChatHistoryItem {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  mode: AnswerMode;
  // Representative domain for the sidebar icon (lib/domain.ts's
  // representativeDomain) — null when genuinely ambiguous/cross-domain.
  domain: string | null;
  messages: ChatMessage[];
}

// Admin-authored site announcement — see NotificationZone and
// /admin/thong-bao. Backed by the SiteAnnouncement singleton row.
// `active` shows/hides the notification dock itself (nothing renders when
// off). `apiEnabled` is a separate kill switch: when false, the chat send
// path skips calling the FastAPI backend entirely and shows `message` in
// place of an answer instead of a connection error (see lib/chat-store.tsx)
// — e.g. out of API tokens, or mid-deploy. `professionalModeEnabled` is a
// third, independent kill switch for Chế độ Chuyên gia specifically (cost
// control) — see ModeBubble and chat-store.tsx. `updatedAt` doubles as the
// per-viewer read-state key, so an edited announcement shows unread again
// even if the previous text was already dismissed.
export interface Announcement {
  message: string;
  active: boolean;
  apiEnabled: boolean;
  professionalModeEnabled: boolean;
  updatedAt: string;
}

export interface RecruiterNote {
  message: string;
  active: boolean;
  updatedAt: string;
}
