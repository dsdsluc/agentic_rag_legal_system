import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Không có quyền quản trị." }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const data: {
    role?: "user" | "admin";
    canEditLegalDocs?: boolean;
    isLocked?: boolean;
    name?: string;
    phone?: string | null;
    occupation?: string | null;
  } = {};

  if ("role" in body) {
    if (body.role !== "user" && body.role !== "admin") {
      return NextResponse.json({ error: "Vai trò không hợp lệ." }, { status: 400 });
    }
    if (id === admin.id && body.role === "user") {
      return NextResponse.json({ error: "Không thể tự gỡ quyền admin của chính mình." }, { status: 400 });
    }
    data.role = body.role;
  }
  if ("canEditLegalDocs" in body) {
    if (typeof body.canEditLegalDocs !== "boolean") {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
    }
    data.canEditLegalDocs = body.canEditLegalDocs;
  }
  if ("isLocked" in body) {
    if (typeof body.isLocked !== "boolean") {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
    }
    if (id === admin.id && body.isLocked) {
      return NextResponse.json({ error: "Không thể tự khóa tài khoản của chính mình." }, { status: 400 });
    }
    data.isLocked = body.isLocked;
  }
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

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Không tìm thấy người dùng." }, { status: 404 });

  const updated = await prisma.user.update({ where: { id }, data });

  // Locking is only meaningful if it also ends any session already in
  // flight — otherwise a locked user stays logged in until their token
  // happens to expire on its own.
  if (data.isLocked === true) {
    await prisma.session.deleteMany({ where: { userId: id } });
  }

  return NextResponse.json({
    user: {
      id: updated.id,
      role: updated.role,
      canEditLegalDocs: updated.canEditLegalDocs,
      isLocked: updated.isLocked,
      name: updated.name,
      phone: updated.phone,
      occupation: updated.occupation,
    },
  });
}
