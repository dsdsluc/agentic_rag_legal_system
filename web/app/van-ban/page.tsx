import { prisma } from "@/lib/prisma";
import { DOC_TYPE_ORDER } from "@/lib/docType";
import { DOMAIN_ORDER } from "@/lib/domain";
import { documentIsAmended } from "@/lib/legalStatus";
import { VanBanTopBar } from "@/components/VanBanTopBar";
import { IndexDocItem } from "@/components/VanBanIndexGrid";
import { VanBanWorkspaceSwitcher, Workspace } from "@/components/VanBanWorkspaceSwitcher";

export const metadata = { title: "Văn bản pháp luật" };

export default async function VanBanIndexPage() {
  const documents = await prisma.document.findMany({
    orderBy: [{ docType: "asc" }, { docNumber: "asc" }],
    include: {
      _count: { select: { articles: { where: { chunkType: "article" } } } },
      relationsFrom: { select: { relationType: true } },
    },
  });

  const totalArticles = documents.reduce((sum, d) => sum + d._count.articles, 0);

  const workspaces: Workspace[] = DOMAIN_ORDER.map((domain) => {
    const domainDocs = documents.filter((d) => d.domain === domain);
    const grouped = domainDocs.reduce<Record<string, typeof domainDocs>>((acc, doc) => {
      (acc[doc.docType] ??= []).push(doc);
      return acc;
    }, {});
    const columns = DOC_TYPE_ORDER.map((type) => {
      const docs: IndexDocItem[] = (grouped[type] ?? []).map((doc) => ({
        id: doc.id,
        title: doc.title,
        docNumber: doc.docNumber,
        description: doc.description,
        articleCount: doc._count.articles,
        effectiveDate: doc.effectiveDate ? doc.effectiveDate.toISOString() : null,
        amended: documentIsAmended(doc.relationsFrom),
      }));
      return { type, docs };
    }).filter((c) => c.docs.length > 0);

    return {
      domain,
      docCount: domainDocs.length,
      articleCount: domainDocs.reduce((sum, d) => sum + d._count.articles, 0),
      columns,
    };
  }).filter((w) => w.docCount > 0);

  return (
    <>
      <VanBanTopBar title="Thư viện văn bản" subtitle={`${documents.length} văn bản · ${totalArticles} Điều khoản`} />
      <div className="w-full px-6 py-8 lg:px-12 lg:py-10">
        <VanBanWorkspaceSwitcher workspaces={workspaces} />
      </div>
    </>
  );
}
