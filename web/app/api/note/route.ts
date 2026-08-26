import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public, unauthenticated — read by AuthBenefits.tsx (shown next to the
// login form) so an outside evaluator sees it without needing an account
// first. Upsert-on-read means no separate seed step, same as /api/announcement.
export async function GET() {
  const row = await prisma.recruiterNote.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  return NextResponse.json({
    note: {
      message: row.message,
      active: row.active,
      updatedAt: row.updatedAt.toISOString(),
    },
  });
}
