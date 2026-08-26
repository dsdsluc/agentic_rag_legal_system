-- CreateTable
CREATE TABLE "QueryUsage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT,
    "mode" "AnswerMode" NOT NULL,
    "stage" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueryUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QueryUsage_createdAt_idx" ON "QueryUsage"("createdAt");

-- CreateIndex
CREATE INDEX "QueryUsage_userId_idx" ON "QueryUsage"("userId");

-- CreateIndex
CREATE INDEX "QueryUsage_conversationId_idx" ON "QueryUsage"("conversationId");
