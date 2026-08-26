-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "domains" TEXT[] DEFAULT ARRAY[]::TEXT[];
