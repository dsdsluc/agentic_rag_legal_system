import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionUser, hashPassword, hashToken, verifyPassword, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Mật khẩu mới phải có ít nhất 8 ký tự." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "Mật khẩu hiện tại không đúng." }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  // A password change should end every OTHER session — same defense-in-depth
  // reasoning as the admin isLocked path revoking sessions on lock. Keep
  // only the session making this request alive.
  const store = await cookies();
  const currentToken = store.get(SESSION_COOKIE)?.value;
  const currentHash = currentToken ? hashToken(currentToken) : null;
  await prisma.session.deleteMany({
    where: { userId: user.id, ...(currentHash ? { tokenHash: { not: currentHash } } : {}) },
  });

  return NextResponse.json({ ok: true });
}
