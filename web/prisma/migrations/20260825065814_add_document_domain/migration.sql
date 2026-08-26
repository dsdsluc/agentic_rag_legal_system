-- CreateEnum
CREATE TYPE "Domain" AS ENUM ('giao_thong', 'dan_su', 'hinh_su');

-- AlterTable
-- Temporary default lets this apply against the 15 existing rows; dropped
-- right after so future inserts must specify a real domain (matches every
-- other required column on Document). prisma/sync-corpus.ts backfills the
-- correct per-document value from documents.json immediately after this
-- migration runs.
ALTER TABLE "Document" ADD COLUMN "domain" "Domain" NOT NULL DEFAULT 'giao_thong';
ALTER TABLE "Document" ALTER COLUMN "domain" DROP DEFAULT;
