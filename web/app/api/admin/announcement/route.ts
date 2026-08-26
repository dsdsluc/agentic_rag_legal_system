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

  const data: { message?: string; active?: boolean; apiEnabled?: boolean; professionalModeEnabled?: boolean } = {};

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
  if ("apiEnabled" in body) {
    if (typeof body.apiEnabled !== "boolean") {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
    }
    data.apiEnabled = body.apiEnabled;
  }
  if ("professionalModeEnabled" in body) {
    if (typeof body.professionalModeEnabled !== "boolean") {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
    }
    data.professionalModeEnabled = body.professionalModeEnabled;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Không có gì để cập nhật." }, { status: 400 });
  }

  // A shown banner (active) or a disabled backend (apiEnabled=false) with
  // no message text is a dead end for whoever sees it — block that combo
  // rather than silently publishing an empty notification.
  const current = await prisma.siteAnnouncement.findUnique({ where: { id: "singleton" } });
  const finalMessage = data.message ?? current?.message ?? "";
  const finalActive = data.active ?? current?.active ?? false;
  const finalApiEnabled = data.apiEnabled ?? current?.apiEnabled ?? true;
  if ((finalActive || !finalApiEnabled) && !finalMessage.trim()) {
    return NextResponse.json({ error: "Cần nhập nội dung thông báo trước." }, { status: 400 });
  }

  const updated = await prisma.siteAnnouncement.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  return NextResponse.json({
    announcement: {
      message: updated.message,
      active: updated.active,
      apiEnabled: updated.apiEnabled,
      professionalModeEnabled: updated.professionalModeEnabled,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
