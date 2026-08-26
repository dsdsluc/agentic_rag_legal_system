-- CreateTable
CREATE TABLE "RecruiterNote" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "message" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruiterNote_pkey" PRIMARY KEY ("id")
);
