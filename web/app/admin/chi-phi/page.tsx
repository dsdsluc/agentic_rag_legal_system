import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { UsageDashboard } from "@/components/admin/UsageDashboard";

export const metadata = { title: "Quản trị · Chi phí" };

const WINDOW_DAYS = 30;
// generate/generate_agent runs exactly once per successful /query call (see
// src/rag/generate.py's answer_question) — every other stage is optional
// pre-processing that can fire zero, one, or several times per call. Using
// this as the "number of queries answered" proxy avoids needing a separate
// per-request id in QueryUsage just to count requests.
const QUERY_STAGES = ["generate", "generate_agent"] as const;

interface DailyRow {
  day: Date;
  cost: number;
  prompt_tokens: number;
  completion_tokens: number;
  queries: number;
}

// Plain helper (not the page component itself) so the "since"/"start of
// today" snapshots don't read as impure calls inside a component's render
// body — same convention as admin/users/sessions/page.tsx's
// loadSessionGroups().
async function loadUsageData() {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [allTime, todayAgg, totalQueries, recentQueries, byStage, byMode, daily, topByConversation] = await Promise.all([
    prisma.queryUsage.aggregate({
      _sum: { costUsd: true, promptTokens: true, completionTokens: true },
    }),
    prisma.queryUsage.aggregate({
      where: { createdAt: { gte: startOfToday } },
      _sum: { costUsd: true, promptTokens: true, completionTokens: true },
    }),
    prisma.queryUsage.count({ where: { stage: { in: [...QUERY_STAGES] } } }),
    prisma.queryUsage.count({ where: { stage: { in: [...QUERY_STAGES] }, createdAt: { gte: since } } }),
    prisma.queryUsage.groupBy({
      by: ["stage"],
      where: { createdAt: { gte: since } },
      _sum: { costUsd: true, promptTokens: true, completionTokens: true },
      _count: true,
    }),
    prisma.queryUsage.groupBy({
      by: ["mode"],
      where: { createdAt: { gte: since } },
      _sum: { costUsd: true },
      _count: true,
    }),
    prisma.$queryRaw<DailyRow[]>`
      SELECT
        date_trunc('day', "createdAt") AS day,
        SUM("costUsd")::float8 AS cost,
        SUM("promptTokens")::int AS prompt_tokens,
        SUM("completionTokens")::int AS completion_tokens,
        COUNT(*) FILTER (WHERE stage IN ('generate', 'generate_agent'))::int AS queries
      FROM "QueryUsage"
      WHERE "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.queryUsage.groupBy({
      by: ["conversationId"],
      where: { createdAt: { gte: since } },
      _sum: { costUsd: true },
      _count: true,
      orderBy: { _sum: { costUsd: "desc" } },
      take: 10,
    }),
  ]);

  const conversations = await prisma.conversation.findMany({
    where: { id: { in: topByConversation.map((c) => c.conversationId) } },
    select: { id: true, title: true, mode: true },
  });
  const conversationById = new Map(conversations.map((c) => [c.id, c]));

  return {
    totals: {
      costUsd: allTime._sum.costUsd ?? 0,
      tokens: (allTime._sum.promptTokens ?? 0) + (allTime._sum.completionTokens ?? 0),
      queries: totalQueries,
    },
    today: {
      costUsd: todayAgg._sum.costUsd ?? 0,
      tokens: (todayAgg._sum.promptTokens ?? 0) + (todayAgg._sum.completionTokens ?? 0),
    },
    recent30d: {
      costUsd: byStage.reduce((sum, s) => sum + (s._sum.costUsd ?? 0), 0),
      queries: recentQueries,
    },
    daily: daily.map((d) => ({
      date: d.day.toISOString(),
      costUsd: d.cost,
      promptTokens: d.prompt_tokens,
      completionTokens: d.completion_tokens,
      queries: d.queries,
    })),
    byStage: byStage.map((s) => ({
      stage: s.stage,
      costUsd: s._sum.costUsd ?? 0,
      tokens: (s._sum.promptTokens ?? 0) + (s._sum.completionTokens ?? 0),
      count: s._count,
    })),
    byMode: byMode.map((m) => ({ mode: m.mode, costUsd: m._sum.costUsd ?? 0, count: m._count })),
    topConversations: topByConversation.map((c) => ({
      conversationId: c.conversationId,
      title: conversationById.get(c.conversationId)?.title ?? "(đã xoá)",
      mode: conversationById.get(c.conversationId)?.mode ?? "citizen",
      costUsd: c._sum.costUsd ?? 0,
      calls: c._count,
    })),
  };
}

export default async function AdminUsagePage() {
  const data = await loadUsageData();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
      <AdminPageHeader
        title="Chi phí & Token"
        subtitle="Chi phí OpenAI thực tế tính từ token trả về mỗi câu hỏi — không cần vào LangSmith."
      />
      <UsageDashboard {...data} />
    </div>
  );
}
