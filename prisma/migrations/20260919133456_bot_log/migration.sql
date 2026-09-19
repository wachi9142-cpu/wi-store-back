-- CreateTable
CREATE TABLE "BotLog" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "lineUserId" TEXT,
    "input" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotLog_createdAt_idx" ON "BotLog"("createdAt");
