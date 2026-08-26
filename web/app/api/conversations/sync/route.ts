import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isChatOwner, resolveChatOwner } from "@/lib/chatOwner";

const MODES = new Set(["citizen", "professional"]);
const ROLES = new Set(["user", "assistant"]);

interface WireUsageEvent {
  stage: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

const KNOWN_DOMAINS = new Set(["giao_thong", "dan_su", "hinh_su"]);

interface WireMessage {
  role: string;
  text: string;
  mode: string;
  sources?: unknown;
  usageEvents: WireUsageEvent[];
  domains: string[];
}

// Same "drop the malformed bit, never reject the whole save" posture as
// parseUsageEvents below — an odd domains payload shouldn't lose the actual
// answer text.
function parseDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((d): d is string => typeof d === "string" && KNOWN_DOMAINS.has(d)).slice(0, 3);
}

// Malformed/missing entries are dropped, not rejected — a corrupted usage
// payload shouldn't block saving the actual conversation text, which is the
// part that matters to the user. See src/rag/usage.py / api/schemas.py's
// UsageOut for the shape this mirrors.
function parseUsageEvents(value: unknown): WireUsageEvent[] {
  if (!value || typeof value !== "object") return [];
  const breakdown = (value as { breakdown?: unknown }).breakdown;
  if (!Array.isArray(breakdown)) return [];
  const out: WireUsageEvent[] = [];
  for (const e of breakdown) {
    if (
      !e ||
      typeof e.stage !== "string" ||
      typeof e.model !== "string" ||
      typeof e.prompt_tokens !== "number" ||
      typeof e.completion_tokens !== "number" ||
      typeof e.cost_usd !== "number"
    ) {
      continue;
    }
    out.push({
      stage: e.stage.slice(0, 64),
      model: e.model.slice(0, 64),
      promptTokens: Math.max(0, Math.trunc(e.prompt_tokens)),
      completionTokens: Math.max(0, Math.trunc(e.completion_tokens)),
      costUsd: Math.max(0, e.cost_usd),
    });
  }
  return out;
}

function parseMessages(value: unknown): WireMessage[] | null {
  if (!Array.isArray(value)) return null;
  const out: WireMessage[] = [];
  for (const m of value) {
    if (
      !m ||
      typeof m.text !== "string" ||
      !m.text.trim() ||
      !ROLES.has(m.role) ||
      !MODES.has(m.mode)
    ) {
      return null;
    }
    out.push({
      role: m.role,
      text: m.text,
      mode: m.mode,
      sources: m.sources,
      usageEvents: parseUsageEvents(m.usage),
      domains: parseDomains(m.domains),
    });
  }
  return out;
}

// Upserts by the client-generated conversation id (see lib/id.ts) instead of
// letting the DB mint its own — the id is already the URL param at /c/[id],
// so there's nothing to map back to the client afterwards. Ownership is
// still re-derived server-side from the session/guest cookie on every call,
// never trusted from the request body.
export async function POST(req: NextRequest) {
  const owner = await resolveChatOwner();
  const body = await req.json().catch(() => null);

  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
  const mode = typeof body?.mode === "string" ? body.mode : "";
  const newMessages = parseMessages(body?.newMessages);

  if (!conversationId || !title || !MODES.has(mode) || !newMessages) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const existing = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true, guestId: true },
  });

  if (existing) {
    if (!isChatOwner(existing, owner)) {
      return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
    }
    await prisma.conversation.update({ where: { id: conversationId }, data: { title } });
  } else {
    await prisma.conversation.create({
      data: {
        id: conversationId,
        title,
        mode: mode as "citizen" | "professional",
        userId: owner.userId,
        guestId: owner.guestId,
      },
    });
  }

  if (newMessages.length > 0) {
    await prisma.message.createMany({
      data: newMessages.map((m) => ({
        conversationId,
        role: m.role,
        text: m.text,
        mode: m.mode as "citizen" | "professional",
        sourcesJson: m.sources ?? undefined,
        domains: m.domains,
      })),
    });
  }

  const usageRows = newMessages.flatMap((m) =>
    m.usageEvents.map((e) => ({
      conversationId,
      userId: owner.userId,
      guestId: owner.guestId,
      mode: m.mode as "citizen" | "professional",
      stage: e.stage,
      model: e.model,
      promptTokens: e.promptTokens,
      completionTokens: e.completionTokens,
      costUsd: e.costUsd,
    }))
  );
  if (usageRows.length > 0) {
    await prisma.queryUsage.createMany({ data: usageRows });
  }

  return NextResponse.json({ ok: true });
}
