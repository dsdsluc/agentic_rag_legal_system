import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { docTypeMeta } from "@/lib/docType";
import { decodeChunkIdFromUrl } from "@/lib/chunkIdUrl";
import { cn } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { EditableHeading } from "@/components/legal/EditableHeading";
import { EditableArticleBody } from "@/components/legal/EditableArticleBody";
import { EditableKhoan } from "@/components/legal/EditableKhoan";

export const metadata = { title: "Quản trị · Sửa Điều" };

// Admin-only counterpart to /van-ban/[docId]/dieu/[articleNumber] — same
// edit components (EditableHeading/EditableArticleBody/EditableKhoan,
// reused as-is, not duplicated), but routed by the Article's own stable
// `id` instead of `docId` + `articleNumber`. The content-review list links
// here specifically because articleNumber is nullable (annex/preamble/
// template chunks) — building a link from a possibly-null number produced
// a literal ".../dieu/null" 404 for those rows. `id` is the primary key,
// never null, so this route can't hit that failure mode by construction.
// Deliberately its own focused view (no prev/next nav, ToC, or supersession
// panel — an admin here is fixing one flagged item, not reading the
// document), not a redirect to the Legal Workspace page.
export default async function AdminArticleReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: encodedId } = await params;
  const id = decodeChunkIdFromUrl(encodedId);

  const article = await prisma.article.findUnique({
    where: { id },
    include: { document: true, khoans: { orderBy: { khoanNumber: "asc" } } },
  });

  if (!article) notFound();

  const meta = docTypeMeta(article.document.docType);

  return (
    <div className="w-full px-6 py-6 lg:px-8">
      <AdminPageHeader
        title={`Điều ${article.articleNumber ?? "?"}`}
        subtitle={article.document.title}
        action={
          <Link
            href="/admin/content-review"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
          >
            <ArrowLeft size={12} />
            Quay lại Rà soát OCR
          </Link>
        }
      />

      <div className="mt-6 max-w-3xl">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.soft)}>
            <meta.icon size={11} />
            {meta.label}
          </span>
          {article.needsReview && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              OCR chưa xác minh
            </span>
          )}
        </div>

        <EditableHeading
          articleId={article.id}
          articleNumber={article.articleNumber}
          heading={article.heading}
          needsReview={article.needsReview}
        />

        <div className="mt-5">
          {article.khoans.length > 0 ? (
            <ol className="flex flex-col gap-3">
              {article.khoans.map((khoan) => (
                <li key={khoan.id} className={cn("rounded-lg border border-l-[3px] border-border bg-card p-4", meta.spine)}>
                  <EditableKhoan
                    khoanId={khoan.id}
                    khoanNumber={khoan.khoanNumber}
                    text={khoan.text}
                    fineMin={khoan.fineMin}
                    fineMax={khoan.fineMax}
                    needsReview={khoan.needsReview}
                    badgeClassName={meta.soft}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <EditableArticleBody articleId={article.id} text={article.text} needsReview={article.needsReview} />
          )}
        </div>
      </div>
    </div>
  );
}
