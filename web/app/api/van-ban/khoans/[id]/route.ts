import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLegalEditor } from "@/lib/legalEditAuth";

function parseOptionalFine(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === null || value === "") return { ok: true, value: null };
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return { ok: true, value: Math.round(value) };
  return { ok: false };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLegalEditor();
  if (!user) return NextResponse.json({ error: "Không có quyền chỉnh sửa." }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const data: { text?: string; fineMin?: number | null; fineMax?: number | null; needsReview?: boolean } = {};

  if ("text" in body) {
    if (typeof body.text !== "string" || !body.text.trim()) {
      return NextResponse.json({ error: "Nội dung không được để trống." }, { status: 400 });
    }
    data.text = body.text;
  }
  if ("fineMin" in body) {
    const parsed = parseOptionalFine(body.fineMin);
    if (!parsed.ok) return NextResponse.json({ error: "Mức phạt tối thiểu không hợp lệ." }, { status: 400 });
    data.fineMin = parsed.value;
  }
  if ("fineMax" in body) {
    const parsed = parseOptionalFine(body.fineMax);
    if (!parsed.ok) return NextResponse.json({ error: "Mức phạt tối đa không hợp lệ." }, { status: 400 });
    data.fineMax = parsed.value;
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
  if (data.fineMin != null && data.fineMax != null && data.fineMin > data.fineMax) {
    return NextResponse.json({ error: "Mức phạt tối thiểu không được lớn hơn tối đa." }, { status: 400 });
  }

  const existing = await prisma.khoan.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Không tìm thấy Khoản." }, { status: 404 });

  const updated = await prisma.khoan.update({ where: { id }, data });
  return NextResponse.json({
    khoan: {
      id: updated.id,
      text: updated.text,
      fineMin: updated.fineMin,
      fineMax: updated.fineMax,
      needsReview: updated.needsReview,
    },
  });
}
