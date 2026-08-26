import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLegalEditor } from "@/lib/legalEditAuth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLegalEditor();
  if (!user) return NextResponse.json({ error: "Không có quyền chỉnh sửa." }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const data: { heading?: string | null; text?: string; needsReview?: boolean } = {};

  if ("heading" in body) {
    if (body.heading !== null && typeof body.heading !== "string") {
      return NextResponse.json({ error: "Tiêu đề không hợp lệ." }, { status: 400 });
    }
    const trimmed = typeof body.heading === "string" ? body.heading.trim().slice(0, 500) : "";
    data.heading = trimmed || null;
  }
  if ("text" in body) {
    if (typeof body.text !== "string" || !body.text.trim()) {
      return NextResponse.json({ error: "Nội dung không được để trống." }, { status: 400 });
    }
    data.text = body.text;
  }
  if ("needsReview" in body) {
    if (typeof body.needsReview !== "boolean") {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
    }
    data.needsReview = body.needsReview;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Không có gì để cập nhật." }, { status: 400 });
  }

  const existing = await prisma.article.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Không tìm thấy Điều." }, { status: 404 });

  const updated = await prisma.article.update({ where: { id }, data });
  return NextResponse.json({
    article: { id: updated.id, heading: updated.heading, text: updated.text, needsReview: updated.needsReview },
  });
}
