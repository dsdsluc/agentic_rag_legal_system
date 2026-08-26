import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// Self-service profile edit — unlike /api/admin/users/[id], this only ever
// touches the caller's own row (no id in the URL) and can't change role,
// canEditLegalDocs, or isLocked; those stay admin-only.
export async function PATCH(req: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const data: { name?: string; phone?: string | null; occupation?: string | null } = {};

  if ("name" in body) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Vui lòng nhập tên." }, { status: 400 });
    }
    data.name = body.name.trim().slice(0, 100);
  }
  if ("phone" in body) {
    if (body.phone !== null && typeof body.phone !== "string") {
      return NextResponse.json({ error: "Số điện thoại không hợp lệ." }, { status: 400 });
    }
    const trimmed = typeof body.phone === "string" ? body.phone.trim().slice(0, 20) : "";
    data.phone = trimmed || null;
  }
  if ("occupation" in body) {
    if (body.occupation !== null && typeof body.occupation !== "string") {
      return NextResponse.json({ error: "Nghề nghiệp không hợp lệ." }, { status: 400 });
    }
    const trimmed = typeof body.occupation === "string" ? body.occupation.trim().slice(0, 100) : "";
    data.occupation = trimmed || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Không có gì để cập nhật." }, { status: 400 });
  }

  const updated = await prisma.user.update({ where: { id: sessionUser.id }, data });

  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      canEditLegalDocs: updated.canEditLegalDocs,
    },
  });
}
