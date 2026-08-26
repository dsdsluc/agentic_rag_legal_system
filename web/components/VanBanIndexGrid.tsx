"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { docTypeMeta } from "@/lib/docType";
import { cn } from "@/lib/utils";

export interface IndexDocItem {
  id: string;
  title: string;
  docNumber: string;
  description: string | null;
  articleCount: number;
  effectiveDate: string | null;
  amended: boolean;
}

const PAGE_SIZE = 3;

function DocColumn({ type, docs }: { type: string; docs: IndexDocItem[] }) {
  const [page, setPage] = useState(1);
  const meta = docTypeMeta(type);
  const totalPages = Math.max(1, Math.ceil(docs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = docs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-2.5">
        <div className="flex items-center gap-2.5">
          <meta.icon size={15} className={meta.text} />
          <h2 className="font-serif text-base font-semibold">{meta.label}</h2>
          <span className="text-xs text-muted-foreground">{docs.length}</span>
        </div>
        {docs.length > 3 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              aria-label="Trang trước"
              className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft size={12} />
            </button>
            <span>
              {safePage}/{totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
              aria-label="Trang sau"
              className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {paged.map((doc, i) => (
          <Link
            key={doc.id}
            href={`/van-ban/${doc.id}`}
            style={{ animationDelay: `${Math.min(i, 2) * 40}ms`, animationFillMode: "backwards" }}
            className={cn(
              "group relative animate-in fade-in slide-in-from-bottom-1 overflow-hidden rounded-xl border border-l-4 border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-10px_rgba(0,0,0,0.2)]",
              meta.spine
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-serif text-base leading-snug font-semibold">{doc.title}</span>
              <ArrowUpRight
                size={16}
                className="mt-0.5 shrink-0 -translate-x-1 translate-y-1 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100"
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{doc.docNumber}</span>
              <span>{doc.articleCount} Điều</span>
              {doc.effectiveDate && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays size={11} />
                  {new Date(doc.effectiveDate).toLocaleDateString("vi-VN")}
                </span>
              )}
              {doc.amended && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-destructive">
                  Đã sửa đổi, bổ sung
                </span>
              )}
            </div>

            {doc.description && (
              <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{doc.description}</p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

// Literal, complete class names (not built via template string) so
// Tailwind's scanner can find them — grid-cols-N is chosen to match however
// many doc-type columns a workspace actually has, instead of always
// reserving 3 tracks and leaving 1-2 of them visibly empty.
const GRID_COLS_LG: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
};

export function VanBanIndexGrid({ columns }: { columns: { type: string; docs: IndexDocItem[] }[] }) {
  const lgCols = GRID_COLS_LG[Math.min(columns.length, 3)] ?? "lg:grid-cols-3";
  return (
    <div className={cn("grid grid-cols-1 gap-8", lgCols)}>
      {columns.map(({ type, docs }) => (
        <DocColumn key={type} type={type} docs={docs} />
      ))}
    </div>
  );
}
