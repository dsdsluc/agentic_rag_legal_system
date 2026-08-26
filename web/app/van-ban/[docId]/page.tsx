import { notFound } from "next/navigation";
import { CalendarDays, Hash } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { docTypeMeta } from "@/lib/docType";
import { documentIsAmended } from "@/lib/legalStatus";
import { cn } from "@/lib/utils";
import { RelatedDocEntry, RelatedDocumentsPanel } from "@/components/RelatedDocumentsPanel";
import { VanBanTopBar } from "@/components/VanBanTopBar";
import { DocumentSearchArea } from "@/components/DocumentSearchArea";

function snippetFor(text: string, heading: string | null): string {
  let body = text.replace(/^Điều\s+\d+\.?\s*/, "");
  if (heading && body.startsWith(heading)) body = body.slice(heading.length);
  body = body.replace(/\s+/g, " ").trim();
  return body.length > 170 ? `${body.slice(0, 170).trimEnd()}…` : body;
}

function fineRangeFor(khoans: { fineMin: number | null; fineMax: number | null }[]): string | null {
  const maxs = khoans.map((k) => k.fineMax).filter((n): n is number => n != null);
  if (maxs.length === 0) return null;
  const mins = khoans.map((k) => k.fineMin).filter((n): n is number => n != null);
  const lo = mins.length ? Math.min(...mins) : Math.min(...maxs);
  const hi = Math.max(...maxs);
  const fmt = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
  return lo === hi ? fmt(hi) : `${fmt(lo)} – ${fmt(hi)}`;
}

export default async function DocumentPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;

  const document = await prisma.document.findUnique({
    where: { id: docId },
    include: {
      articles: {
        where: { chunkType: "article" },
        orderBy: { articleNumber: "asc" },
        include: {
          _count: { select: { khoans: true } },
          khoans: { select: { fineMin: true, fineMax: true } },
        },
      },
      relationsFrom: { include: { toDocument: true } },
      relationsTo: { include: { fromDocument: true } },
    },
  });

  if (!document) notFound();

  const resolvedRelations = await prisma.khoanRelation.findMany({
    where: {
      resolved: true,
      OR: [{ toKhoan: { article: { documentId: docId } } }, { toDocumentId: docId, toKhoanId: null }],
    },
    select: { toArticleNumber: true, toKhoan: { select: { articleId: true } } },
  });
  const amendedArticleIds = new Set(
    resolvedRelations.map((r) => r.toKhoan?.articleId).filter((id): id is string => Boolean(id))
  );
  const amendedArticleNumbers = new Set(
    resolvedRelations.filter((r) => !r.toKhoan).map((r) => r.toArticleNumber).filter((n): n is number => n != null)
  );

  const meta = docTypeMeta(document.docType);
  const amended = documentIsAmended(document.relationsFrom);
  const articleItems = document.articles.map((article) => ({
    id: article.id,
    articleNumber: article.articleNumber,
    heading: article.heading,
    needsReview: article.needsReview,
    khoanCount: article._count.khoans,
    fineRange: fineRangeFor(article.khoans),
    snippet: snippetFor(article.text, article.heading),
    searchText: article.text.toLowerCase(),
    amended:
      amendedArticleIds.has(article.id) ||
      (article.articleNumber != null && amendedArticleNumbers.has(article.articleNumber)),
  }));
  const relatedEntries: RelatedDocEntry[] = [
    ...document.relationsFrom.map((rel) => ({
      id: rel.id,
      relationType: rel.relationType,
      href: rel.toDocument ? `/van-ban/${rel.toDocument.id}` : null,
      label: rel.toDocument ? rel.toDocument.title : rel.toDocText,
      suffix: false,
    })),
    ...document.relationsTo.map((rel) => ({
      id: rel.id,
      relationType: rel.relationType,
      href: `/van-ban/${rel.fromDocument.id}`,
      label: rel.fromDocument.title,
      suffix: true,
    })),
  ];

  return (
    <>
      <VanBanTopBar title={document.title} />
      <div className="mx-auto w-full max-w-[1400px] px-6 py-8 lg:px-12 lg:py-10">
      <DocumentSearchArea documentId={document.id} documentTitle={document.title} docType={document.docType} articles={articleItems}>
      <header className={cn("relative mt-4 overflow-hidden rounded-xl border border-l-4 border-border bg-card p-7 lg:p-10", meta.spine)}>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-linear-to-br opacity-[0.12] blur-3xl",
            meta.gradientFrom,
            "to-transparent"
          )}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", meta.soft)}>
              <meta.icon size={12} />
              {meta.label}
            </span>
            {amended && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                Đã sửa đổi, bổ sung
              </span>
            )}
          </div>
          <RelatedDocumentsPanel entries={relatedEntries} />
        </div>
        <h1 className="relative mt-4 font-serif text-2xl leading-tight font-semibold tracking-tight md:text-[1.75rem]">
          {document.title}
        </h1>
        <dl className="relative mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Hash size={13} />
            <dt className="sr-only">Số hiệu</dt>
            <dd className="font-mono">{document.docNumber}</dd>
          </div>
          {document.effectiveDate && (
            <div className="flex items-center gap-1.5">
              <CalendarDays size={13} />
              <dt className="sr-only">Hiệu lực từ</dt>
              <dd>{document.effectiveDate.toLocaleDateString("vi-VN")}</dd>
            </div>
          )}
          <div>{document.articles.length} Điều</div>
        </dl>
        {document.description && (
          <p className="relative mt-5 max-w-2xl text-[15px] leading-relaxed text-foreground/80">
            {document.description}
          </p>
        )}
      </header>
      </DocumentSearchArea>
      </div>
    </>
  );
}
