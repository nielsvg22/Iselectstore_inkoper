-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('NEW', 'QUEUED', 'ANALYZED', 'FAILED', 'STALE');

-- CreateEnum
CREATE TYPE "UserState" AS ENUM ('NONE', 'INTERESTING', 'FAVORITE', 'IGNORED');

-- CreateEnum
CREATE TYPE "DataOrigin" AS ENUM ('MANUAL_URL', 'IMPORT', 'FEED', 'PARTNER_API', 'DEMO');

-- CreateEnum
CREATE TYPE "FactSource" AS ENUM ('CONFIRMED', 'SELLER_CLAIM', 'AI_ESTIMATE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PriceKind" AS ENUM ('ASKING_CURRENT', 'ASKING_HISTORIC', 'REALIZED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DealBand" AS ENUM ('TOP', 'VERY_INTERESTING', 'INTERESTING', 'MODERATE', 'NOT_INTERESTING');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('INTERESTING', 'CONTACTED', 'NEGOTIATING', 'BOUGHT', 'LISTED', 'SOLD', 'REJECTED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('TELEGRAM', 'DISCORD', 'EMAIL', 'WEBPUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "query" TEXT NOT NULL DEFAULT '',
    "sourceKind" "DataOrigin" NOT NULL DEFAULT 'MANUAL_URL',
    "sourceConfig" JSONB NOT NULL DEFAULT '{}',
    "intervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "notifyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyChannels" JSONB NOT NULL DEFAULT '["TELEGRAM"]',
    "notifyMinScore" INTEGER NOT NULL DEFAULT 75,
    "prioritizeNew" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "interestingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchRule" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" TEXT NOT NULL,
    "op" TEXT,
    "field" TEXT,
    "operator" TEXT,
    "value" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Advertisement" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'marktplaats',
    "origin" "DataOrigin" NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "askingPriceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "location" TEXT,
    "postalCode" TEXT,
    "distanceKm" DOUBLE PRECISION,
    "category" TEXT,
    "sellerType" TEXT,
    "shippingOptions" JSONB NOT NULL DEFAULT '[]',
    "conditionText" TEXT,
    "publishedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedOkAt" TIMESTAMP(3),
    "fingerprint" TEXT NOT NULL,
    "rawPayload" JSONB,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'NEW',
    "statusError" TEXT,
    "userState" "UserState" NOT NULL DEFAULT 'NONE',
    "needsManualReview" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "contentHash" TEXT NOT NULL DEFAULT '',
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "duplicateOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Advertisement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvertisementImage" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdvertisementImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppleProduct" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "modelLabel" TEXT NOT NULL,
    "recognizedBy" TEXT NOT NULL DEFAULT 'rules',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conditionGrade" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppleProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSpecification" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" "FactSource" NOT NULL,
    "evidence" TEXT,

    CONSTRAINT "ProductSpecification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketComparable" (
    "id" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "storageGb" INTEGER,
    "ramGb" INTEGER,
    "variantKey" TEXT NOT NULL DEFAULT '',
    "priceCents" INTEGER NOT NULL,
    "kind" "PriceKind" NOT NULL,
    "batteryHealth" INTEGER,
    "conditionGrade" TEXT,
    "source" TEXT NOT NULL DEFAULT 'marktplaats',
    "sourceUrl" TEXT,
    "sourceAdId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketComparable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuationHistory" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "lowCents" INTEGER NOT NULL,
    "expectedCents" INTEGER NOT NULL,
    "highCents" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "realizedUsed" INTEGER NOT NULL DEFAULT 0,
    "uncertain" BOOLEAN NOT NULL DEFAULT false,
    "methodology" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValuationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealAnalysis" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "valuationId" TEXT,
    "askingCents" INTEGER NOT NULL,
    "lowCents" INTEGER NOT NULL,
    "expectedCents" INTEGER NOT NULL,
    "highCents" INTEGER NOT NULL,
    "valuationConfidence" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "uncertain" BOOLEAN NOT NULL DEFAULT false,
    "costs" JSONB NOT NULL,
    "netProfitCents" INTEGER NOT NULL,
    "conservativeProfitCents" INTEGER NOT NULL,
    "optimisticProfitCents" INTEGER NOT NULL,
    "grossMarginPct" DOUBLE PRECISION NOT NULL,
    "netMarginPct" DOUBLE PRECISION NOT NULL,
    "roiPct" DOUBLE PRECISION NOT NULL,
    "minSalePriceCents" INTEGER NOT NULL,
    "maxBidCents" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "band" "DealBand" NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "settingsSnapshot" JSONB NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "level" "RiskLevel" NOT NULL,
    "score" INTEGER NOT NULL,
    "flags" JSONB NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "needsManualReview" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileMatch" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "profileId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adId" TEXT,
    "title" TEXT NOT NULL,
    "modelKey" TEXT,
    "storageGb" INTEGER,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'INTERESTING',
    "askingCents" INTEGER,
    "buyPriceCents" INTEGER,
    "boughtAt" TIMESTAMP(3),
    "conditionNote" TEXT,
    "repairCostCents" INTEGER NOT NULL DEFAULT 0,
    "extraCostCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "salePriceCents" INTEGER NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "extraCostCents" INTEGER NOT NULL DEFAULT 0,
    "platform" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "secret" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 4,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "uniqueKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceHealth" (
    "id" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "lastOkAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "requestsToday" INTEGER NOT NULL DEFAULT 0,
    "day" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCache" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "SearchProfile_userId_active_idx" ON "SearchProfile"("userId", "active");

-- CreateIndex
CREATE INDEX "SearchRule_profileId_idx" ON "SearchRule"("profileId");

-- CreateIndex
CREATE INDEX "SearchRule_parentId_idx" ON "SearchRule"("parentId");

-- CreateIndex
CREATE INDEX "Advertisement_fingerprint_idx" ON "Advertisement"("fingerprint");

-- CreateIndex
CREATE INDEX "Advertisement_status_idx" ON "Advertisement"("status");

-- CreateIndex
CREATE INDEX "Advertisement_firstSeenAt_idx" ON "Advertisement"("firstSeenAt");

-- CreateIndex
CREATE INDEX "Advertisement_userState_idx" ON "Advertisement"("userState");

-- CreateIndex
CREATE INDEX "Advertisement_isDemo_idx" ON "Advertisement"("isDemo");

-- CreateIndex
CREATE UNIQUE INDEX "Advertisement_source_externalId_key" ON "Advertisement"("source", "externalId");

-- CreateIndex
CREATE INDEX "AdvertisementImage_adId_idx" ON "AdvertisementImage"("adId");

-- CreateIndex
CREATE INDEX "PriceHistory_adId_observedAt_idx" ON "PriceHistory"("adId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppleProduct_adId_key" ON "AppleProduct"("adId");

-- CreateIndex
CREATE INDEX "AppleProduct_modelKey_idx" ON "AppleProduct"("modelKey");

-- CreateIndex
CREATE INDEX "AppleProduct_family_idx" ON "AppleProduct"("family");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSpecification_productId_key_key" ON "ProductSpecification"("productId", "key");

-- CreateIndex
CREATE INDEX "MarketComparable_modelKey_storageGb_idx" ON "MarketComparable"("modelKey", "storageGb");

-- CreateIndex
CREATE INDEX "MarketComparable_modelKey_kind_idx" ON "MarketComparable"("modelKey", "kind");

-- CreateIndex
CREATE INDEX "ValuationHistory_adId_computedAt_idx" ON "ValuationHistory"("adId", "computedAt");

-- CreateIndex
CREATE INDEX "ValuationHistory_modelKey_computedAt_idx" ON "ValuationHistory"("modelKey", "computedAt");

-- CreateIndex
CREATE INDEX "DealAnalysis_adId_isCurrent_idx" ON "DealAnalysis"("adId", "isCurrent");

-- CreateIndex
CREATE INDEX "DealAnalysis_score_idx" ON "DealAnalysis"("score");

-- CreateIndex
CREATE INDEX "DealAnalysis_createdAt_idx" ON "DealAnalysis"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiskAssessment_adId_key" ON "RiskAssessment"("adId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileMatch_profileId_adId_key" ON "ProfileMatch"("profileId", "adId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_adId_idx" ON "Notification"("adId");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_adId_key" ON "Watchlist"("userId", "adId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_adId_key" ON "Purchase"("adId");

-- CreateIndex
CREATE INDEX "Purchase_userId_status_idx" ON "Purchase"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_purchaseId_key" ON "Sale"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJob_uniqueKey_key" ON "BackgroundJob"("uniqueKey");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_runAt_priority_idx" ON "BackgroundJob"("status", "runAt", "priority");

-- CreateIndex
CREATE INDEX "BackgroundJob_type_idx" ON "BackgroundJob"("type");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsage_day_provider_key" ON "AiUsage"("day", "provider");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "SearchProfile" ADD CONSTRAINT "SearchProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchRule" ADD CONSTRAINT "SearchRule_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "SearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchRule" ADD CONSTRAINT "SearchRule_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SearchRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertisementImage" ADD CONSTRAINT "AdvertisementImage_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleProduct" ADD CONSTRAINT "AppleProduct_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecification" ADD CONSTRAINT "ProductSpecification_productId_fkey" FOREIGN KEY ("productId") REFERENCES "AppleProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealAnalysis" ADD CONSTRAINT "DealAnalysis_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileMatch" ADD CONSTRAINT "ProfileMatch_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "SearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileMatch" ADD CONSTRAINT "ProfileMatch_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Advertisement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
