-- Additive: preserves profiles, advertisements, notifications and run history.
ALTER TABLE "CheckRun" ADD COLUMN "sourceId" TEXT;
CREATE INDEX "CheckRun_sourceId_startedAt_idx" ON "CheckRun"("sourceId", "startedAt");
