import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { ChunkType, DocType, Domain, PrismaClient } from "../lib/generated/prisma/client.js";

// Reads the JSON/JSONL files the Python ingestion pipeline already produces
// (data/processed/) and upserts them into Postgres. Purely a read
// projection for the web app's document-viewing/citation-linking UI —
// never writes back, never touches Chroma/BM25. Safe to re-run any time
// after the corpus is rebuilt; every write below is an upsert or a
// delete-then-recreate of a small table, not a blind insert.

const DATA_DIR = join(import.meta.dirname, "..", "..", "data", "processed");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface DocumentRow {
  doc_id: string;
  title: string;
  doc_type: string;
  domain: string;
  doc_number: string;
  description: string;
  source: string;
  effective_date: string | null;
}

interface ChunkRow {
  chunk_id: string;
  doc_id: string;
  article_number: number | null;
  article_heading: string | null;
  text: string;
  chunk_type: string;
  needs_review: boolean;
  ocr_confidence: number | null;
  khoan_number: string | number | null;
  parent_chunk_id: string | null;
  fine_min: number | null;
  fine_max: number | null;
}

interface RelationEdgeRow {
  from_doc_id: string;
  relation_type: string;
  to_doc_text: string;
  to_doc_id: string | null;
}

interface KhoanRelationRow {
  from_chunk_id: string;
  to_doc_id: string;
  to_article_number: number | null;
  to_khoan_label: string | null;
  to_chunk_id: string | null;
  relation_type: string;
  resolved: boolean;
  note: string | null;
}

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, filename), "utf-8"));
}

function readJsonl<T>(filename: string): T[] {
  return readFileSync(join(DATA_DIR, filename), "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

async function syncDocuments(documents: DocumentRow[]): Promise<void> {
  for (const doc of documents) {
    const data = {
      title: doc.title,
      docType: doc.doc_type as DocType,
      domain: doc.domain as Domain,
      docNumber: doc.doc_number,
      description: doc.description,
      source: doc.source,
      effectiveDate: doc.effective_date ? new Date(doc.effective_date) : null,
    };
    await prisma.document.upsert({
      where: { id: doc.doc_id },
      create: { id: doc.doc_id, ...data },
      update: data,
    });
  }
  console.log(`Synced ${documents.length} documents`);
}

async function syncArticlesAndKhoan(chunks: ChunkRow[]): Promise<void> {
  // Articles first — Khoan.articleId is a foreign key into Article.
  const articles = chunks.filter((c) => c.chunk_type !== "khoan");
  for (const a of articles) {
    const data = {
      documentId: a.doc_id,
      articleNumber: a.article_number,
      heading: a.article_heading,
      text: a.text,
      chunkType: a.chunk_type as ChunkType,
      needsReview: a.needs_review,
      ocrConfidence: a.ocr_confidence,
    };
    await prisma.article.upsert({
      where: { id: a.chunk_id },
      create: { id: a.chunk_id, ...data },
      update: data,
    });
  }
  console.log(`Synced ${articles.length} articles`);

  const khoans = chunks.filter((c) => c.chunk_type === "khoan" && c.parent_chunk_id);

  // Khoan.id is the chunk_id khoan_split.py assigned
  // ("{article_id}::khoan_{N}") — normally unique per article, but a source
  // article whose trailing text absorbed unrelated numbered content (e.g.
  // ND_151_2024 Điều 39: a short closing article followed, with no next
  // Điều to bound it, by a signature block and several appendix forms each
  // restarting their own "1. 2. 3..." list) produces several khoản with the
  // same number under the same article — same chunk_id, so the same
  // Postgres primary key. The upsert below just keeps the last one rather
  // than erroring, which is fine for this kind of boilerplate, but warn
  // instead of losing it silently.
  const seenKhoanIds = new Set<string>();
  const duplicateKhoanIds = new Set<string>();
  for (const k of khoans) {
    if (seenKhoanIds.has(k.chunk_id)) duplicateKhoanIds.add(k.chunk_id);
    seenKhoanIds.add(k.chunk_id);
  }
  if (duplicateKhoanIds.size > 0) {
    console.warn(
      `WARNING: ${duplicateKhoanIds.size} khoản chunk_id(s) appear more than once in corpus.jsonl ` +
        `(colliding khoản numbers under the same article — likely mis-split boilerplate, see comment above). ` +
        `Only the last occurrence of each survives in Postgres:`,
      [...duplicateKhoanIds]
    );
  }

  for (const k of khoans) {
    const data = {
      articleId: k.parent_chunk_id as string,
      khoanNumber: String(k.khoan_number),
      text: k.text,
      fineMin: k.fine_min,
      fineMax: k.fine_max,
      needsReview: k.needs_review,
    };
    await prisma.khoan.upsert({
      where: { id: k.chunk_id },
      create: { id: k.chunk_id, ...data },
      update: data,
    });
  }
  console.log(`Synced ${khoans.length} khoản`);
}

async function syncDocumentRelations(edges: RelationEdgeRow[]): Promise<void> {
  // No natural unique key (from/to/type can legitimately repeat across a
  // rebuild in a different order) — this table is small (a few dozen rows),
  // so delete-then-recreate is simpler and just as safe as trying to diff.
  await prisma.documentRelation.deleteMany({});
  await prisma.documentRelation.createMany({
    data: edges.map((e) => ({
      fromDocumentId: e.from_doc_id,
      toDocumentId: e.to_doc_id,
      toDocText: e.to_doc_text,
      relationType: e.relation_type,
    })),
  });
  console.log(`Synced ${edges.length} document relations`);
}

async function syncKhoanRelations(edges: KhoanRelationRow[]): Promise<void> {
  await prisma.khoanRelation.deleteMany({});
  await prisma.khoanRelation.createMany({
    data: edges.map((e) => ({
      fromChunkId: e.from_chunk_id,
      // Only resolved AND khoản-level edges point at a real Khoan row — a
      // "whole Điều replaced" edge (heading has no khoản/điểm word, e.g.
      // "Sửa đổi, bổ sung Điều 42") resolves against an Article instead
      // (to_khoan_label null), which Khoan.id's foreign key can't accept.
      // Still fully described via toDocumentId + toArticleNumber either way.
      toKhoanId: e.resolved && e.to_khoan_label ? e.to_chunk_id : null,
      toDocumentId: e.to_doc_id,
      toArticleNumber: e.to_article_number,
      toKhoanLabel: e.to_khoan_label,
      relationType: e.relation_type,
      resolved: e.resolved,
      note: e.note,
    })),
  });
  console.log(`Synced ${edges.length} khoản relations`);
}

async function main(): Promise<void> {
  const documents = readJson<DocumentRow[]>("documents.json");
  const chunks = readJsonl<ChunkRow>("corpus.jsonl");
  const documentRelations = readJson<RelationEdgeRow[]>("relations.json");
  const khoanRelations = readJson<KhoanRelationRow[]>("khoan_relations.json");

  // Document -> Article -> Khoan -> DocumentRelation -> KhoanRelation:
  // strict foreign-key dependency order.
  await syncDocuments(documents);
  await syncArticlesAndKhoan(chunks);
  await syncDocumentRelations(documentRelations);
  await syncKhoanRelations(khoanRelations);

  const [documentCount, articleCount, khoanCount, docRelCount, khoanRelCount] = await Promise.all([
    prisma.document.count(),
    prisma.article.count(),
    prisma.khoan.count(),
    prisma.documentRelation.count(),
    prisma.khoanRelation.count(),
  ]);
  console.log("Postgres now has:", {
    documents: documentCount,
    articles: articleCount,
    khoans: khoanCount,
    documentRelations: docRelCount,
    khoanRelations: khoanRelCount,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
