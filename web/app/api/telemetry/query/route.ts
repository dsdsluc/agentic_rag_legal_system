import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveChatOwner } from "@/lib/chatOwner";

const MODES = new Set(["citizen", "professional"]);
const MAX_ERROR_MESSAGE_LENGTH = 500;

// Fire-and-forget from the browser (see lib/api.ts's reportQueryTelemetry)
// — always returns 200-ish quickly and never surfaces a validation error
// back to the caller in a way that could disrupt chat; a malformed payload
// is just dropped.
export async function POST(req: NextRequest) {
  const owner = await resolveChatOwner();
  const body = await req.json().catch(() => null);

  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  const mode = typeof body?.mode === "string" ? body.mode : "";
  const success = typeof body?.success === "boolean" ? body.success : null;
  const latencyMs = typeof body?.latencyMs === "number" && Number.isFinite(body.latencyMs) ? Math.max(0, Math.trunc(body.latencyMs)) : null;

  if (!conversationId || !MODES.has(mode) || success === null || latencyMs === null) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const statusCode =
    typeof body?.statusCode === "number" && Number.isFinite(body.statusCode) ? Math.trunc(body.statusCode) : null;
  const errorMessage =
    typeof body?.errorMessage === "string" ? body.errorMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH) : null;

  await prisma.queryLog.create({
    data: {
      conversationId,
      userId: owner.userId,
      guestId: owner.guestId,
      mode: mode as "citizen" | "professional",
      success,
      statusCode,
      errorMessage,
      latencyMs,
    },
  });

  return NextResponse.json({ ok: true });
}
