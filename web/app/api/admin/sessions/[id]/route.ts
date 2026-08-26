import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Không có quyền quản trị." }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.session.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Không tìm thấy phiên." }, { status: 404 });

  await prisma.session.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
