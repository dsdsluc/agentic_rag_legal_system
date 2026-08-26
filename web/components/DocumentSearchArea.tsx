"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { docTypeMeta } from "@/lib/docType";
import { cn } from "@/lib/utils";

export interface ArticleListItem {
  id: string;
  articleNumber: number | null;
  heading: string | null;
  needsReview: boolean;
  amended: boolean;
  khoanCount: number;
  fineRange: string | null;
  snippet: string;
  searchText: string;
}

const PAGE_SIZE = 12;

export function DocumentSearchArea({
  documentId,
  documentTitle,
  docType,
  articles,
  children,
}: {
  documentId: string;
  documentTitle: string;
  docType: string;
  articles: ArticleListItem[];
  children: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const meta = docTypeMeta(docType);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) =>
        a.heading?.toLowerCase().includes(q) ||
        a.searchText.includes(q) ||
        String(a.articleNumber ?? "").includes(q)
    );
  }, [articles, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamp for render + as the base for Prev/Next so a stale `page` (e.g.
  // narrowing a search while on page 8 of what's now 3 pages) never shows
  // an empty page or lets Prev/Next step off the clamped range.
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <>
      <nav className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link href="/van-ban" className="shrink-0 transition-colors hover:text-foreground">
            Thư viện văn bản
          </Link>
          <span className="shrink-0 opacity-50">/</span>
          <span className="truncate text-foreground/70">{documentTitle}</span>
        </div>
        <div className="flex w-52 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-sm transition-colors focus-within:border-primary sm:w-64">
          <Search size={13} className="shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm Điều khoản..."
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
      </nav>

      {children}

      <div className="mt-8">
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Điều khoản ({filtered.length}
              {filtered.length !== articles.length ? ` / ${articles.length}` : ""})
            </h2>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, safePage - 1))}
                  disabled={safePage <= 1}
                  aria-label="Trang trước"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                </button>
                <span>
                  Trang {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage >= totalPages}
                  aria-label="Trang sau"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Không tìm thấy Điều khoản nào khớp với &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {paged.map((article, i) => (
                <li key={article.id}>
                  <Link
                    href={`/van-ban/${documentId}/dieu/${article.articleNumber}`}
                    style={{ animationDelay: `${Math.min(i, 17) * 25}ms`, animationFillMode: "backwards" }}
                    className={cn(
                      "group flex h-full animate-in fade-in flex-col gap-2.5 rounded-xl border border-l-4 border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_18px_-8px_rgba(0,0,0,0.18)]",
                      meta.spine
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={cn("shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-semibold", meta.soft)}>
                        Điều {article.articleNumber}
                      </span>
                      {(article.needsReview || article.amended) && (
                        <span className="flex shrink-0 gap-1">
                          {article.amended && (
                            <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                              Sửa đổi
                            </span>
                          )}
                          {article.needsReview && (
                            <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                              OCR
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    <h3 className="font-serif text-base leading-snug font-semibold">{article.heading}</h3>

                    {article.snippet && (
                      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{article.snippet}</p>
                    )}

                    {(article.khoanCount > 0 || article.fineRange) && (
                      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-muted-foreground">
                        {article.khoanCount > 0 && <span>{article.khoanCount} khoản</span>}
                        {article.fineRange && (
                          <span className="font-mono font-medium text-foreground/70">{article.fineRange}</span>
                        )}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
