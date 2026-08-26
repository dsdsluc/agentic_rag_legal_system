import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { HealthDashboard } from "@/components/admin/HealthDashboard";

export const metadata = { title: "Quản trị · Tình trạng hệ thống" };

const WINDOW_DAYS = 14;

interface DailyRow {
  day: Date;
  total: number;
  ok: number;
  errors: number;
  avg_latency: number | null;
  p50_latency: number | null;
  p95_latency: number | null;
}

interface OverallRow {
  total: number;
  ok: number;
  errors: number;
  avg_latency: number | null;
  p50_latency: number | null;
  p95_latency: number | null;
}

// Plain helper (not the page component itself) so the "since" snapshot
// doesn't read as an impure call inside a component's render body — same
// convention as admin/users/sessions/page.tsx's loadSessionGroups() and
// admin/chi-phi/page.tsx's loadUsageData().
async function loadHealthData() {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [[overallAllTime], [overallRecent], daily, recentErrors] = await Promise.all([
    prisma.$queryRaw<OverallRow[]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE success)::int AS ok,
        COUNT(*) FILTER (WHERE NOT success)::int AS errors,
        AVG("latencyMs")::float8 AS avg_latency,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "latencyMs")::float8 AS p50_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float8 AS p95_latency
      FROM "QueryLog"
    `,
    prisma.$queryRaw<OverallRow[]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE success)::int AS ok,
        COUNT(*) FILTER (WHERE NOT success)::int AS errors,
        AVG("latencyMs")::float8 AS avg_latency,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "latencyMs")::float8 AS p50_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float8 AS p95_latency
      FROM "QueryLog"
      WHERE "createdAt" >= ${since}
    `,
    prisma.$queryRaw<DailyRow[]>`
      SELECT
        date_trunc('day', "createdAt") AS day,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE success)::int AS ok,
        COUNT(*) FILTER (WHERE NOT success)::int AS errors,
        AVG("latencyMs")::float8 AS avg_latency,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "latencyMs")::float8 AS p50_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float8 AS p95_latency
      FROM "QueryLog"
      WHERE "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.queryLog.findMany({
      where: { success: false },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, mode: true, statusCode: true, errorMessage: true, latencyMs: true, createdAt: true },
    }),
  ]);

  return {
    allTime: {
      total: overallAllTime?.total ?? 0,
      errors: overallAllTime?.errors ?? 0,
      p50: overallAllTime?.p50_latency ?? 0,
      p95: overallAllTime?.p95_latency ?? 0,
    },
    recentWindow: {
      total: overallRecent?.total ?? 0,
      ok: overallRecent?.ok ?? 0,
      errors: overallRecent?.errors ?? 0,
      avgLatency: overallRecent?.avg_latency ?? 0,
      p50: overallRecent?.p50_latency ?? 0,
      p95: overallRecent?.p95_latency ?? 0,
    },
    daily: daily.map((d) => ({
      date: d.day.toISOString(),
      total: d.total,
      ok: d.ok,
      errors: d.errors,
      avgLatency: d.avg_latency ?? 0,
      p50: d.p50_latency ?? 0,
      p95: d.p95_latency ?? 0,
    })),
    recentErrors: recentErrors.map((e) => ({
      id: e.id,
      mode: e.mode,
      statusCode: e.statusCode,
      errorMessage: e.errorMessage,
      latencyMs: e.latencyMs,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export default async function AdminHealthPage() {
  const data = await loadHealthData();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
      <AdminPageHeader
        title="Tình trạng hệ thống"
        subtitle="Tỷ lệ lỗi và độ trễ thực tế của /query — ghi lại ở trình duyệt vì FastAPI chỉ log ra stdout."
      />
      <HealthDashboard {...data} windowDays={WINDOW_DAYS} />
    </div>
  );
}
