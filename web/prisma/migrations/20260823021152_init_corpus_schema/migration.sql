-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('luat', 'nghi_dinh', 'thong_tu');

-- CreateEnum
CREATE TYPE "ChunkType" AS ENUM ('article', 'preamble', 'annex', 'template');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "docType" "DocType" NOT NULL,
    "docNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "articleNumber" INTEGER,
    "heading" TEXT,
    "text" TEXT NOT NULL,
    "chunkType" "ChunkType" NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "ocrConfidence" DOUBLE PRECISION,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Khoan" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "khoanNumber" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "fineMin" INTEGER,
    "fineMax" INTEGER,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Khoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRelation" (
    "id" TEXT NOT NULL,
    "fromDocumentId" TEXT NOT NULL,
    "toDocumentId" TEXT,
    "toDocText" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,

    CONSTRAINT "DocumentRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KhoanRelation" (
    "id" TEXT NOT NULL,
    "fromChunkId" TEXT NOT NULL,
    "toKhoanId" TEXT,
    "toDocumentId" TEXT NOT NULL,
    "toArticleNumber" INTEGER,
    "toKhoanLabel" TEXT,
    "relationType" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL,
    "note" TEXT,

    CONSTRAINT "KhoanRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Article_documentId_idx" ON "Article"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_documentId_articleNumber_key" ON "Article"("documentId", "articleNumber");

-- CreateIndex
CREATE INDEX "Khoan_articleId_idx" ON "Khoan"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "Khoan_articleId_khoanNumber_key" ON "Khoan"("articleId", "khoanNumber");

-- CreateIndex
CREATE INDEX "DocumentRelation_fromDocumentId_idx" ON "DocumentRelation"("fromDocumentId");

-- CreateIndex
CREATE INDEX "DocumentRelation_toDocumentId_idx" ON "DocumentRelation"("toDocumentId");

-- CreateIndex
CREATE INDEX "KhoanRelation_toKhoanId_idx" ON "KhoanRelation"("toKhoanId");

-- CreateIndex
CREATE INDEX "KhoanRelation_fromChunkId_idx" ON "KhoanRelation"("fromChunkId");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Khoan" ADD CONSTRAINT "Khoan_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRelation" ADD CONSTRAINT "DocumentRelation_fromDocumentId_fkey" FOREIGN KEY ("fromDocumentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRelation" ADD CONSTRAINT "DocumentRelation_toDocumentId_fkey" FOREIGN KEY ("toDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KhoanRelation" ADD CONSTRAINT "KhoanRelation_toKhoanId_fkey" FOREIGN KEY ("toKhoanId") REFERENCES "Khoan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
