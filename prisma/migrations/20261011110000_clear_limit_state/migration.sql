-- Rest van de verwijderde dagelijkse requestblokkade opruimen (bron-status en achtergrondtaken).
UPDATE "SourceHealth" SET "ok" = true, "lastError" = NULL, "lastErrorAt" = NULL, "requestsToday" = 0 WHERE "lastError" IS NULL OR "lastError" ILIKE '%requestlimiet%';
UPDATE "BackgroundJob" SET "lastError" = NULL WHERE "lastError" ILIKE '%requestlimiet%';
UPDATE "SearchProfile" SET "lastError" = NULL WHERE "lastError" ILIKE '%limiet%';
