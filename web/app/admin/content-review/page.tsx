import { prisma } from "@/lib/prisma";
import { encodeChunkIdForUrl } from "@/lib/chunkIdUrl";
import { ContentReviewPageClient } from "@/components/admin/ContentReviewPageClient";
import type { ReviewItem } from "@/components/admin/ReviewGroup";

export const metadata = { title: "Quản trị · Rà soát OCR" };

function snippet(text: string, max = 160): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export default async function AdminContentReviewPage() {
  const [articles, khoans] = await Promise.all([
    prisma.article.findMany({
      where: { needsReview: true },
      include: { document: true },
      orderBy: [{ documentId: "asc" }, { articleNumber: "asc" }],
    }),
    prisma.khoan.findMany({
      where: { needsReview: true },
      include: { article: { include: { document: true } } },
      orderBy: [{ article: { documentId: "asc" } }, { article: { articleNumber: "asc" } }, { khoanNumber: "asc" }],
    }),
  ]);

  const byDoc = new Map<string, { docTitle: string; docType: string; items: ReviewItem[] }>();

  function bucket(docId: string, docTitle: string, docType: string) {
    if (!byDoc.has(docId)) byDoc.set(docId, { docTitle, docType, items: [] });
    return byDoc.get(docId)!;
  }

  for (const a of articles) {
    bucket(a.documentId, a.document.title, a.document.docType).items.push({
      kind: "article",
      id: a.id,
      // articleNumber is nullable (annex/preamble/template chunks) — a link
      // built from docId+articleNumber would render literal ".../dieu/null"
      // for those rows. Routed by `a.id` (never null) instead — see
      // app/admin/content-review/dieu/[id]/page.tsx.
      label: `Điều ${a.articleNumber ?? "?"}${a.heading ? `. ${a.heading}` : ""}`,
      snippet: snippet(a.text),
      href: `/admin/content-review/dieu/${encodeChunkIdForUrl(a.id)}`,
    });
  }
  for (const k of khoans) {
    const a = k.article;
    bucket(a.documentId, a.document.title, a.document.docType).items.push({
      kind: "khoan",
      id: k.id,
      label: `Điều ${a.articleNumber ?? "?"}, Khoản ${k.khoanNumber}`,
      snippet: snippet(k.text),
      href: `/admin/content-review/khoan/${encodeChunkIdForUrl(k.id)}`,
    });
  }

  const groups = Array.from(byDoc.entries()).map(([docId, g]) => ({ docId, ...g }));
  const total = articles.length + khoans.length;

  return <ContentReviewPageClient groups={groups} total={total} />;
}
