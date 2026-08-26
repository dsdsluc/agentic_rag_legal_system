"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Bot, Coins, MessagesSquare, Zap } from "lucide-react";

interface DailyPoint {
  date: string;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
  queries: number;
}

interface StageRow {
  stage: string;
  costUsd: number;
  tokens: number;
  count: number;
}

interface ModeRow {
  mode: string;
  costUsd: number;
  count: number;
}

interface ConversationRow {
  conversationId: string;
  title: string;
  mode: string;
  costUsd: number;
  calls: number;
}

// Human labels for src/rag/usage.py's stage tags — kept in sync by hand
// since the stage string is free-text on both ends (Python writes it,
// Postgres stores it as-is); an unrecognized stage still renders (falls
// back to the raw tag) rather than disappearing from the chart.
const STAGE_LABEL: Record<string, string> = {
  query_rewrite: "Viết lại câu hỏi",
  condense_question: "Gộp lịch sử hội thoại",
  khoan_select: "Chọn khoản",
  relevance_filter: "Lọc liên quan",
  generate: "Sinh câu trả lời",
  generate_agent: "Sinh câu trả lời (dùng công cụ)",
  reflection: "Rà soát lại",
};

function formatUsd(v: number): string {
  if (v < 0.01 && v > 0) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

function formatTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${v}`;
}

function formatDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
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

export function UsageDashboard({
  totals,
  today,
  recent30d,
  daily,
  byStage,
  byMode,
  topConversations,
}: {
  totals: { costUsd: number; tokens: number; queries: number };
  today: { costUsd: number; tokens: number };
  recent30d: { costUsd: number; queries: number };
  daily: DailyPoint[];
  byStage: StageRow[];
  byMode: ModeRow[];
  topConversations: ConversationRow[];
}) {
  const chartData = daily.map((d) => ({ ...d, dateLabel: formatDateLabel(d.date) }));
  const stageData = [...byStage].sort((a, b) => b.costUsd - a.costUsd);
  const maxStageCost = Math.max(1e-9, ...stageData.map((s) => s.costUsd));
  const totalModeCost = byMode.reduce((s, m) => s + m.costUsd, 0) || 1;

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Coins}
          label="Tổng chi phí (từ đầu)"
          value={formatUsd(totals.costUsd)}
          sub={`${formatTokens(totals.tokens)} token`}
        />
        <StatCard
          icon={Zap}
          label="Chi phí hôm nay"
          value={formatUsd(today.costUsd)}
          sub={`${formatTokens(today.tokens)} token`}
        />
        <StatCard
          icon={MessagesSquare}
          label="Câu hỏi đã trả lời"
          value={totals.queries.toLocaleString("vi-VN")}
          sub={`${recent30d.queries.toLocaleString("vi-VN")} trong 30 ngày qua`}
        />
        <StatCard
          icon={Bot}
          label="Chi phí 30 ngày qua"
          value={formatUsd(recent30d.costUsd)}
          sub={recent30d.queries > 0 ? `~${formatUsd(recent30d.costUsd / recent30d.queries)}/câu hỏi` : undefined}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Chi phí theo ngày (30 ngày qua)</h2>
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${Number(v).toFixed(3)}`}
                width={56}
              />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                formatter={(value) => [formatUsd(Number(value)), "Chi phí"]}
              />
              <Area type="monotone" dataKey="costUsd" stroke="var(--chart-1)" strokeWidth={2} fill="url(#costFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Token theo ngày — đầu vào so với đầu ra</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Token đầu ra (completion) đắt gấp 4 lần token đầu vào với gpt-4o-mini.
        </p>
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatTokens(Number(v))}
                width={48}
              />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                formatter={(value, name) => [
                  formatTokens(Number(value)),
                  name === "promptTokens" ? "Đầu vào" : "Đầu ra",
                ]}
              />
              <Legend formatter={(value: string) => (value === "promptTokens" ? "Đầu vào" : "Đầu ra")} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="promptTokens" stackId="tokens" fill="var(--chart-2)" />
              <Bar dataKey="completionTokens" stackId="tokens" fill="var(--chart-5)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Chi phí theo bước xử lý (30 ngày qua)</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Một câu hỏi có thể chạy qua nhiều bước — mỗi bước một lượt gọi OpenAI riêng.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {stageData.length === 0 && <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>}
            {stageData.map((s) => (
              <div key={s.stage}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{STAGE_LABEL[s.stage] ?? s.stage}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatUsd(s.costUsd)} · {s.count.toLocaleString("vi-VN")} lượt gọi
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(2, (s.costUsd / maxStageCost) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Theo chế độ trả lời</h2>
          <div className="mt-4 flex flex-col gap-3">
            {byMode.map((m) => (
              <div key={m.mode}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{m.mode === "citizen" ? "Người dân" : "Chuyên gia"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatUsd(m.costUsd)}</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={m.mode === "citizen" ? "h-full rounded-full bg-citizen" : "h-full rounded-full bg-professional"}
                    style={{ width: `${(m.costUsd / totalModeCost) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {byMode.length === 0 && <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Hội thoại tốn chi phí nhiều nhất (30 ngày qua)</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Hội thoại</th>
                <th className="pb-2 font-medium">Chế độ</th>
                <th className="pb-2 text-right font-medium">Lượt gọi</th>
                <th className="pb-2 text-right font-medium">Chi phí</th>
              </tr>
            </thead>
            <tbody>
              {topConversations.map((c) => (
                <tr key={c.conversationId} className="border-b border-border/60 last:border-0">
                  <td className="max-w-[280px] truncate py-2 pr-2">{c.title}</td>
                  <td className="py-2 pr-2 text-muted-foreground">{c.mode === "citizen" ? "Người dân" : "Chuyên gia"}</td>
                  <td className="py-2 text-right text-muted-foreground">{c.calls}</td>
                  <td className="py-2 text-right font-medium">{formatUsd(c.costUsd)}</td>
                </tr>
              ))}
              {topConversations.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                    Chưa có dữ liệu.
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
