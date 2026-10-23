-- Push: de browser meldt terug of de melding echt is getoond (of waarom niet)
ALTER TABLE "PushSubscription" ADD COLUMN "lastShownAt" TIMESTAMP(3), ADD COLUMN "lastShowError" TEXT;
