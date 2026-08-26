import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { claimGuestConversations } from "@/lib/guestClaim";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Vui lòng nhập email và mật khẩu." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !ok) {
    return NextResponse.json({ error: "Email hoặc mật khẩu không đúng." }, { status: 401 });
  }
  if (user.isLocked) {
    return NextResponse.json({ error: "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên." }, { status: 403 });
  }

  const { token, expiresAt } = await createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  await claimGuestConversations(user.id);

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, canEditLegalDocs: user.canEditLegalDocs },
  });
}
