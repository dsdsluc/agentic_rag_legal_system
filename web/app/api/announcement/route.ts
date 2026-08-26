import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public, unauthenticated — read by both the notification dock (chat +
// Legal Workspace) and the chat send path (to check apiEnabled before
// calling FastAPI). Upsert-on-read means no separate seed step: the first
// request ever made creates the singleton row with its schema defaults
// (active=false, apiEnabled=true — i.e. nothing shown, API on).
export async function GET() {
  const row = await prisma.siteAnnouncement.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  return NextResponse.json({
    announcement: {
      message: row.message,
      active: row.active,
      apiEnabled: row.apiEnabled,
      professionalModeEnabled: row.professionalModeEnabled,
      updatedAt: row.updatedAt.toISOString(),
    },
  });
}
