"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertTriangle, Gauge, ListChecks } from "lucide-react";

interface DailyPoint {
  date: string;
  total: number;
  ok: number;
  errors: number;
  avgLatency: number;
  p50: number;
  p95: number;
}

interface ErrorRow {
  id: string;
  mode: string;
  statusCode: number | null;
  errorMessage: string | null;
  latencyMs: number;
  createdAt: string;
}

function formatMs(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(2)}s`;
  return `${Math.round(v)}ms`;
}

function formatPercent(v: number): string {
  return `${v.toFixed(1)}%`;
}

function formatDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub?: string;
  tone?: "warning";
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
          tone === "warning" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon size={17} />
      </span>
      <div>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <p className="mt-0.5 text-[11px] text-muted-foreground/70">{sub}</p>}
      </div>
    </div>
  );
}

export function HealthDashboard({
  allTime,
  recentWindow,
  daily,
  recentErrors,
  windowDays,
}: {
  allTime: { total: number; errors: number; p50: number; p95: number };
  recentWindow: { total: number; ok: number; errors: number; avgLatency: number; p50: number; p95: number };
  daily: DailyPoint[];
  recentErrors: ErrorRow[];
  windowDays: number;
}) {
  const chartData = daily.map((d) => ({ ...d, dateLabel: formatDateLabel(d.date) }));
  const allTimeErrorRate = allTime.total > 0 ? (allTime.errors / allTime.total) * 100 : 0;
  const recentErrorRate = recentWindow.total > 0 ? (recentWindow.errors / recentWindow.total) * 100 : 0;

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={ListChecks}
          label="Tổng số câu hỏi (từ đầu)"
          value={allTime.total.toLocaleString("vi-VN")}
          sub={`${recentWindow.total.toLocaleString("vi-VN")} trong ${windowDays} ngày qua`}
        />
        <StatCard
          icon={AlertTriangle}
          label={`Tỷ lệ lỗi (${windowDays} ngày qua)`}
          value={formatPercent(recentErrorRate)}
          sub={`${recentWindow.errors.toLocaleString("vi-VN")} lỗi / ${recentWindow.total.toLocaleString("vi-VN")} yêu cầu · từ đầu ${formatPercent(allTimeErrorRate)}`}
          tone={recentErrorRate >= 5 ? "warning" : undefined}
        />
        <StatCard icon={Gauge} label="Độ trễ trung vị (p50)" value={formatMs(recentWindow.p50)} sub={`Trung bình ${formatMs(recentWindow.avgLatency)}`} />
        <StatCard icon={Activity} label="Độ trễ p95" value={formatMs(recentWindow.p95)} sub="95% câu hỏi trả lời nhanh hơn mức này" />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Số câu hỏi theo ngày — thành công so với lỗi</h2>
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                formatter={(value, name) => [value, name === "ok" ? "Thành công" : "Lỗi"]}
              />
              <Legend formatter={(value: string) => (value === "ok" ? "Thành công" : "Lỗi")} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="ok" stackId="vol" fill="var(--chart-3)" />
              <Bar dataKey="errors" stackId="vol" fill="var(--destructive)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Độ trễ theo ngày (p50 / p95)</h2>
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="p95Fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatMs(Number(v))}
                width={48}
              />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                formatter={(value, name) => [formatMs(Number(value)), name === "p50" ? "p50" : "p95"]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="p95" stroke="var(--chart-1)" strokeWidth={1.5} fill="url(#p95Fill)" />
              <Line type="monotone" dataKey="p50" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Lỗi gần đây</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Thời gian</th>
                <th className="pb-2 font-medium">Chế độ</th>
                <th className="pb-2 font-medium">Mã lỗi</th>
                <th className="pb-2 font-medium">Nội dung lỗi</th>
                <th className="pb-2 text-right font-medium">Độ trễ</th>
              </tr>
            </thead>
            <tbody>
              {recentErrors.map((e) => (
                <tr key={e.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-2 whitespace-nowrap text-muted-foreground">{formatDateTime(e.createdAt)}</td>
                  <td className="py-2 pr-2 text-muted-foreground">{e.mode === "citizen" ? "Người dân" : "Chuyên gia"}</td>
                  <td className="py-2 pr-2 text-muted-foreground">{e.statusCode ?? "—"}</td>
                  <td className="max-w-[360px] truncate py-2 pr-2">{e.errorMessage ?? "(không rõ)"}</td>
                  <td className="py-2 text-right text-muted-foreground">{formatMs(e.latencyMs)}</td>
                </tr>
              ))}
              {recentErrors.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    Chưa ghi nhận lỗi nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
