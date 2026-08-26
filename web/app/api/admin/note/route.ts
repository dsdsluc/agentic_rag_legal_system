import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Không có quyền quản trị." }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const data: { message?: string; active?: boolean } = {};

  if ("message" in body) {
    if (typeof body.message !== "string") {
      return NextResponse.json({ error: "Nội dung không hợp lệ." }, { status: 400 });
    }
    data.message = body.message.trim().slice(0, 2000);
  }
  if ("active" in body) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
    }
    data.active = body.active;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Không có gì để cập nhật." }, { status: 400 });
  }

  const current = await prisma.recruiterNote.findUnique({ where: { id: "singleton" } });
  const finalMessage = data.message ?? current?.message ?? "";
  const finalActive = data.active ?? current?.active ?? false;
  if (finalActive && !finalMessage.trim()) {
    return NextResponse.json({ error: "Cần nhập nội dung ghi chú trước." }, { status: 400 });
  }

  const updated = await prisma.recruiterNote.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  return NextResponse.json({
    note: {
      message: updated.message,
      active: updated.active,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
