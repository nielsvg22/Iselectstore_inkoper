-- De dagelijkse requestblokkade bestaat niet meer: oude foutmeldingen en tellers opruimen.
UPDATE "SearchProfile" SET "lastError" = NULL WHERE "lastError" ILIKE '%requestlimiet%';
UPDATE "SourceHealth" SET "requestsToday" = 0, "lastError" = NULL WHERE "lastError" ILIKE '%requestlimiet%' OR "requestsToday" > 0;
