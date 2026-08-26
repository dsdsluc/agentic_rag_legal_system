import Link from "next/link";
import {
  Bell,
  CircleDollarSign,
  FileText,
  FileWarning,
  KeyRound,
  MessagesSquare,
  ShieldCheck,
  Users,
  Activity,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const metadata = { title: "Quản trị hệ thống" };

const ACCENT = {
  professional: { border: "border-l-professional", icon: "bg-professional-soft text-professional-foreground" },
  destructive: { border: "border-l-destructive", icon: "bg-destructive/10 text-destructive" },
  citizen: { border: "border-l-citizen", icon: "bg-citizen-soft text-citizen-foreground" },
  primary: { border: "border-l-primary", icon: "bg-primary/10 text-primary" },
} as const;

function formatUsd(v: number): string {
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

// Plain helper (not the page component's render body) so the "startOfToday"/
// "since24h" snapshot reads as an explicit step — same convention as
// admin/tinh-trang/page.tsx's loadHealthData() and admin/chi-phi/page.tsx's
// loadUsageData().
async function loadOverviewData() {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    userCount,
    adminCount,
    activeSessionCount,
    articleReviewCount,
    khoanReviewCount,
    conversationCount,
    documentCount,
    articleCount,
    announcement,
    costTodayAgg,
    logs24hTotal,
    logs24hOk,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.session.count({ where: { expiresAt: { gt: now } } }),
    prisma.article.count({ where: { needsReview: true } }),
    prisma.khoan.count({ where: { needsReview: true } }),
    prisma.conversation.count(),
    prisma.document.count(),
    prisma.article.count(),
    prisma.siteAnnouncement.findUnique({ where: { id: "singleton" } }),
    prisma.queryUsage.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: startOfToday } } }),
    prisma.queryLog.count({ where: { createdAt: { gte: since24h } } }),
    prisma.queryLog.count({ where: { createdAt: { gte: since24h }, success: true } }),
  ]);

  return {
    userCount,
    adminCount,
    activeSessionCount,
    reviewCount: articleReviewCount + khoanReviewCount,
    conversationCount,
    documentCount,
    articleCount,
    announcementActive: announcement?.active ?? false,
    costToday: costTodayAgg._sum.costUsd ?? 0,
    successRate24h: logs24hTotal > 0 ? Math.round((logs24hOk / logs24hTotal) * 100) : null,
    logs24hTotal,
  };
}

function StatTile({
  href,
  icon: Icon,
  accent,
  label,
  value,
  sub,
}: {
  href: string;
  icon: typeof Users;
  accent: keyof typeof ACCENT;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col gap-3 rounded-xl border border-l-4 border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-10px_rgba(0,0,0,0.2)] ${ACCENT[accent].border}`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${ACCENT[accent].icon}`}>
        <Icon size={18} />
      </span>
      <div>
        <p className="font-serif text-base font-semibold">{value}</p>
        <p className="mt-0.5 text-sm font-medium text-foreground/80">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      </div>
    </Link>
  );
}

export default async function AdminIndexPage() {
  const data = await loadOverviewData();

  return (
    <div className="w-full px-6 py-6 lg:px-8">
      <AdminPageHeader title="Tổng quan" subtitle="Trạng thái hệ thống và các việc cần làm" />

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          href="/admin/users"
          icon={Users}
          accent="professional"
          label="Người dùng"
          value={`${data.userCount}`}
          sub={`${data.adminCount} quản trị viên`}
        />
        <StatTile
          href="/admin/users/sessions"
          icon={KeyRound}
          accent="professional"
          label="Phiên đăng nhập"
          value={`${data.activeSessionCount}`}
          sub="đang hoạt động"
        />
        <StatTile
          href="/admin/content-review"
          icon={FileWarning}
          accent="destructive"
          label="Rà soát OCR"
          value={`${data.reviewCount}`}
          sub="đoạn cần rà soát"
        />
        <StatTile
          href="/admin/hoi-thoai"
          icon={MessagesSquare}
          accent="primary"
          label="Hội thoại"
          value={`${data.conversationCount}`}
          sub="đã được lưu lại"
        />
        <StatTile
          href="/admin/chi-phi"
          icon={CircleDollarSign}
          accent="citizen"
          label="Chi phí OpenAI"
          value={formatUsd(data.costToday)}
          sub="tính từ 00:00 hôm nay"
        />
        <StatTile
          href="/admin/tinh-trang"
          icon={Activity}
          accent={data.successRate24h !== null && data.successRate24h < 95 ? "destructive" : "primary"}
          label="Tỷ lệ thành công"
          value={data.successRate24h !== null ? `${data.successRate24h}%` : "—"}
          sub={`${data.logs24hTotal} lượt /query · 24 giờ qua`}
        />
        <StatTile
          href="/admin/thong-bao"
          icon={Bell}
          accent={data.announcementActive ? "citizen" : "primary"}
          label="Thông báo hệ thống"
          value={data.announcementActive ? "Đang bật" : "Đang tắt"}
          sub="banner góc phụ trên chat"
        />
        <StatTile
          href="/van-ban"
          icon={FileText}
          accent="primary"
          label="Văn bản pháp luật"
          value={`${data.documentCount}`}
          sub={`${data.articleCount} Điều trong kho dữ liệu`}
        />
      </div>

      <div className="mt-8">
        <p className="mb-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Truy cập nhanh</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/users/roles"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ShieldCheck size={15} />
            Phân quyền
          </Link>
          <Link
            href="/admin/users/activity"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Activity size={15} />
            Hoạt động gần đây
          </Link>
        </div>
      </div>
    </div>
  );
}
