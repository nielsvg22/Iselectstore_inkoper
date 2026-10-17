-- Oude platformafstand had geen bevestigd referentiepunt. Bewaar de oorspronkelijke
-- waarde voor herstel; laat deze niet langer als afstand tot Apeldoorn meetellen.
UPDATE "Advertisement"
SET "rawPayload" = COALESCE("rawPayload", '{}'::jsonb) || jsonb_build_object('legacyDistanceKm', "distanceKm"),
    "distanceKm" = NULL
WHERE "source" = 'marktplaats' AND "isDemo" = false AND "distanceKm" IS NOT NULL
  AND COALESCE("rawPayload"->'attributes'->>'distanceReference', '') <> 'Apeldoorn';
