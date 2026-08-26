import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { docTypeMeta } from "@/lib/docType";
import { decodeChunkIdFromUrl } from "@/lib/chunkIdUrl";
import { cn } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { EditableKhoan } from "@/components/legal/EditableKhoan";

export const metadata = { title: "Quản trị · Sửa Khoản" };

// Admin-only counterpart for a single flagged Khoản — see the sibling
// dieu/[id] route's comment for why this is keyed by the Khoản's own `id`
// rather than docId/articleNumber/khoanNumber.
export default async function AdminKhoanReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: encodedId } = await params;
  const id = decodeChunkIdFromUrl(encodedId);

  const khoan = await prisma.khoan.findUnique({
    where: { id },
    include: { article: { include: { document: true } } },
  });

  if (!khoan) notFound();

  const meta = docTypeMeta(khoan.article.document.docType);

  return (
    <div className="w-full px-6 py-6 lg:px-8">
      <AdminPageHeader
        title={`Điều ${khoan.article.articleNumber ?? "?"}, Khoản ${khoan.khoanNumber}`}
        subtitle={khoan.article.document.title}
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
          {khoan.article.heading && (
            <span className="text-xs text-muted-foreground">{khoan.article.heading}</span>
          )}
        </div>

        <div className={cn("rounded-lg border border-l-[3px] border-border bg-card p-4", meta.spine)}>
          <EditableKhoan
            khoanId={khoan.id}
            khoanNumber={khoan.khoanNumber}
            text={khoan.text}
            fineMin={khoan.fineMin}
            fineMax={khoan.fineMax}
            needsReview={khoan.needsReview}
            badgeClassName={meta.soft}
          />
        </div>
      </div>
    </div>
  );
}
