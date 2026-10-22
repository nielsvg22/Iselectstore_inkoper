-- Additive: preserve all advertisements, purchases, rules and settings.
ALTER TABLE "Advertisement"
  ADD COLUMN "driveSeconds" DOUBLE PRECISION,
  ADD COLUMN "driveMeters" DOUBLE PRECISION,
  ADD COLUMN "driveCalculatedAt" TIMESTAMP(3),
  ADD COLUMN "driveCoordinatesKey" TEXT,
  ADD COLUMN "driveError" TEXT;
CREATE INDEX "Advertisement_driveSeconds_idx" ON "Advertisement"("driveSeconds");
