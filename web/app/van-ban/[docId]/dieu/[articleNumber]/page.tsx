import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { docTypeMeta } from "@/lib/docType";
import { cn } from "@/lib/utils";
import { VanBanTopBar } from "@/components/VanBanTopBar";
import { EditableHeading } from "@/components/legal/EditableHeading";
import { EditableKhoan } from "@/components/legal/EditableKhoan";
import { EditableArticleBody } from "@/components/legal/EditableArticleBody";

function formatFine(min: number | null, max: number | null): string | null {
  if (max == null) return null;
  const fmt = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
  return min != null ? `${fmt(min)} – ${fmt(max)}` : `đến ${fmt(max)}`;
}

type ChunkLink = { href: string; label: string };

// fromChunkId isn't a foreign key (see prisma/schema.prisma) — the amending
// side can be a whole Điều or a specific khoản, so resolving it into a link
// means checking which table actually has that id.
async function resolveChunkLink(chunkId: string): Promise<ChunkLink | null> {
  if (chunkId.includes("::khoan_")) {
    const khoan = await prisma.khoan.findUnique({
      where: { id: chunkId },
      include: { article: { include: { document: true } } },
    });
    if (!khoan) return null;
    return {
      href: `/van-ban/${khoan.article.documentId}/dieu/${khoan.article.articleNumber}#khoan-${khoan.khoanNumber}`,
      label: `${khoan.article.document.title}, Điều ${khoan.article.articleNumber}, Khoản ${khoan.khoanNumber}`,
    };
  }
  const article = await prisma.article.findUnique({ where: { id: chunkId }, include: { document: true } });
  if (!article) return null;
  return {
    href: `/van-ban/${article.documentId}/dieu/${article.articleNumber}`,
    label: `${article.document.title}, Điều ${article.articleNumber}`,
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ docId: string; articleNumber: string }>;
}) {
  const { docId, articleNumber } = await params;
  const articleNumberInt = Number(articleNumber);

  const article = await prisma.article.findUnique({
    where: { documentId_articleNumber: { documentId: docId, articleNumber: articleNumberInt } },
    include: {
      document: true,
      khoans: { orderBy: { khoanNumber: "asc" } },
    },
  });

  if (!article) notFound();

  const meta = docTypeMeta(article.document.docType);
  const khoanIds = article.khoans.map((k) => k.id);

  // Two shapes of "this got superseded": a specific khoản was amended
  // (toKhoanId set), or the whole Điều was replaced wholesale (heading had
  // no khoản/điểm word — see khoan_relations.py — so there's no Khoan row
  // to point a foreign key at, just the plain doc/article-number fields).
  const [khoanSupersessions, wholeArticleSupersessions] = await Promise.all([
    khoanIds.length
      ? prisma.khoanRelation.findMany({ where: { toKhoanId: { in: khoanIds }, resolved: true } })
      : Promise.resolve([]),
    prisma.khoanRelation.findMany({
      where: { toDocumentId: docId, toArticleNumber: articleNumberInt, toKhoanId: null, resolved: true },
    }),
  ]);

  const supersessionByKhoan = new Map<string, ChunkLink>();
  for (const rel of khoanSupersessions) {
    if (!rel.toKhoanId) continue;
    const link = await resolveChunkLink(rel.fromChunkId);
    if (link) supersessionByKhoan.set(rel.toKhoanId, link);
  }
  const wholeArticleLinks: ChunkLink[] = [];
  for (const rel of wholeArticleSupersessions) {
    const link = await resolveChunkLink(rel.fromChunkId);
    if (link) wholeArticleLinks.push(link);
  }

  const showToc = article.khoans.length > 3;

  const [prevArticle, nextArticle] = await Promise.all([
    prisma.article.findFirst({
      where: { documentId: docId, articleNumber: { lt: articleNumberInt } },
      orderBy: { articleNumber: "desc" },
      select: { articleNumber: true, heading: true },
    }),
    prisma.article.findFirst({
      where: { documentId: docId, articleNumber: { gt: articleNumberInt } },
      orderBy: { articleNumber: "asc" },
      select: { articleNumber: true, heading: true },
    }),
  ]);

  return (
    <>
      <VanBanTopBar title={`Điều ${article.articleNumber}`} />
      <div className="mx-auto w-full max-w-[1400px] px-6 py-8 lg:px-12 lg:py-10">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/van-ban" className="transition-colors hover:text-foreground">
          Thư viện văn bản
        </Link>
        <span className="opacity-50">/</span>
        <Link href={`/van-ban/${article.documentId}`} className="truncate transition-colors hover:text-foreground">
          {article.document.title}
        </Link>
        <span className="opacity-50">/</span>
        <span className="shrink-0 text-foreground/70">Điều {article.articleNumber}</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-4">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.soft)}>
          <meta.icon size={11} />
          {meta.label}
        </span>
        <EditableHeading
          articleId={article.id}
          articleNumber={article.articleNumber}
          heading={article.heading}
          needsReview={article.needsReview}
        />
        {article.needsReview && (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
            OCR chưa xác minh
          </span>
        )}
      </header>

      {wholeArticleLinks.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          {wholeArticleLinks.map((link, i) => (
            <p key={i} className="rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              Toàn bộ Điều này đã được sửa đổi, bổ sung bởi{" "}
              <Link href={link.href} className="font-medium underline underline-offset-2">
                {link.label}
              </Link>
              .
            </p>
          ))}
        </div>
      )}

      <div className={cn("mt-8 grid grid-cols-1 gap-8", showToc && "lg:grid-cols-[1fr_240px]")}>
        <section>
          {article.khoans.length > 0 ? (
            <ol className="flex flex-col gap-4">
              {article.khoans.map((khoan, i) => {
                const supersededBy = supersessionByKhoan.get(khoan.id);
                return (
                  <li key={khoan.id} id={`khoan-${khoan.khoanNumber}`} className="scroll-mt-24">
                    <div
                      style={{ animationDelay: `${Math.min(i, 12) * 30}ms`, animationFillMode: "backwards" }}
                      className={cn(
                        "animate-in fade-in slide-in-from-bottom-1 rounded-lg border border-l-[3px] border-border bg-card p-4",
                        meta.spine
                      )}
                    >
                      <EditableKhoan
                        khoanId={khoan.id}
                        khoanNumber={khoan.khoanNumber}
                        text={khoan.text}
                        fineMin={khoan.fineMin}
                        fineMax={khoan.fineMax}
                        needsReview={khoan.needsReview}
                        badgeClassName={meta.soft}
                      />
                      {supersededBy && (
                        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          Đã được sửa đổi, bổ sung bởi{" "}
                          <Link href={supersededBy.href} className="font-medium underline underline-offset-2">
                            {supersededBy.label}
                          </Link>
                          .
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EditableArticleBody articleId={article.id} text={article.text} needsReview={article.needsReview} />
          )}
        </section>

        {showToc && (
          <aside className="hidden lg:block lg:sticky lg:top-16 lg:self-start">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="px-2 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Khoản trong điều này
              </p>
              <nav className="flex max-h-[70vh] flex-col gap-0.5 overflow-y-auto">
                {article.khoans.map((khoan) => {
                  const fine = formatFine(khoan.fineMin, khoan.fineMax);
                  return (
                    <a
                      key={khoan.id}
                      href={`#khoan-${khoan.khoanNumber}`}
                      className="flex items-baseline gap-1.5 rounded-md px-2 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <span className="shrink-0">K.{khoan.khoanNumber}</span>
                      {fine && (
                        <>
                          <span className="min-w-0 flex-1 border-b border-dotted border-current opacity-40" />
                          <span className="shrink-0">{fine}</span>
                        </>
                      )}
                    </a>
                  );
                })}
              </nav>
            </div>
          </aside>
        )}
      </div>

      {(prevArticle || nextArticle) && (
        <section className="mt-12 border-t border-border pt-6">
          <p className="mb-3 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Xem thêm trong {article.document.title}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {prevArticle ? (
              <Link
                href={`/van-ban/${docId}/dieu/${prevArticle.articleNumber}`}
                className={cn(
                  "group flex flex-col gap-1 rounded-xl border border-l-[3px] border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-10px_rgba(0,0,0,0.2)]",
                  meta.spine
                )}
              >
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <ChevronLeft size={12} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
                  Điều trước
                </span>
                <span className="font-serif text-base font-semibold">
                  Điều {prevArticle.articleNumber}
                  {prevArticle.heading ? `. ${prevArticle.heading}` : ""}
                </span>
              </Link>
            ) : (
              <div className="hidden sm:block" />
            )}

            {nextArticle && (
              <Link
                href={`/van-ban/${docId}/dieu/${nextArticle.articleNumber}`}
                className={cn(
                  "group flex flex-col items-end gap-1 rounded-xl border border-r-[3px] border-border bg-card p-4 text-right transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-10px_rgba(0,0,0,0.2)] sm:col-start-2",
                  meta.spine.replace("border-l-", "border-r-")
                )}
              >
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  Điều sau
                  <ChevronRight size={12} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
                <span className="font-serif text-base font-semibold">
                  Điều {nextArticle.articleNumber}
                  {nextArticle.heading ? `. ${nextArticle.heading}` : ""}
                </span>
              </Link>
            )}
          </div>
        </section>
      )}
      </div>
    </>
  );
}
