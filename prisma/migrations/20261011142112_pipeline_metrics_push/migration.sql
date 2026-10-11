-- AlterTable
ALTER TABLE "Advertisement" ADD COLUMN     "analyzedAt" TIMESTAMP(3),
ADD COLUMN     "prefilteredAt" TIMESTAMP(3),
ADD COLUMN     "sellerId" TEXT,
ADD COLUMN     "sellerName" TEXT,
ADD COLUMN     "sellerSignals" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "sellerVerified" BOOLEAN;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyPrefs" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckRun" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "cacheHits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CheckRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "CheckRun_profileId_startedAt_idx" ON "CheckRun"("profileId", "startedAt");

-- CreateIndex
CREATE INDEX "CheckRun_startedAt_idx" ON "CheckRun"("startedAt");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
