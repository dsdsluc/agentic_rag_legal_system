import Link from "next/link";
import { MessageSquare, Scale } from "lucide-react";

export function VanBanTopBar({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border/70 bg-background/90 px-6 py-2.5 backdrop-blur-sm lg:px-12">
      <div className="flex min-w-0 items-center gap-2.5">
        <Link
          href="/van-ban"
          className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-foreground"
        >
          <Scale size={12} />
          Legal Workspace
        </Link>
        {title && (
          <>
            <span className="shrink-0 text-border">-</span>
            <span className="truncate font-serif text-sm font-semibold">{title}</span>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {subtitle && <span className="hidden text-xs text-muted-foreground sm:inline">{subtitle}</span>}
        <Link
          href="/"
          title="Về trang trò chuyện"
          aria-label="Về trang trò chuyện"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground"
        >
          <MessageSquare size={14} />
        </Link>
      </div>
    </div>
  );
}
