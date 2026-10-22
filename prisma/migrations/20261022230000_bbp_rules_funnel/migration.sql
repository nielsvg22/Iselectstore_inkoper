-- Inkoopregels/funnel: geopend/aangeklikt per melding, aantal keer teruggezien, M-nummer bij aankopen
ALTER TABLE "Notification" ADD COLUMN "openedAt" TIMESTAMP(3), ADD COLUMN "clickedAt" TIMESTAMP(3);
ALTER TABLE "Advertisement" ADD COLUMN "seenCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Purchase" ADD COLUMN "mNumber" TEXT;
CREATE UNIQUE INDEX "Purchase_userId_mNumber_key" ON "Purchase"("userId", "mNumber");
