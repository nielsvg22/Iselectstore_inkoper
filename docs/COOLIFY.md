# Deployen op Coolify

1. Nieuwe resource uit GitHub (`nielsvg22/Iselectstore_inkoper`, branch `claude/apple-deal-hunter`), build pack **Docker Compose**, bestand `/docker-compose.yml`.
2. Omgevingsvariabelen: `APP_SECRET` (min. 32 tekens, `openssl rand -hex 32`), `POSTGRES_PASSWORD`, optioneel `CRON_SECRET`.
3. Domein bij service `web`: `https://<jouw-domein>:3000` (de app luistert intern op 3000; geen poort naar buiten gepubliceerd).
4. Deploy. `web` voert bij het starten `prisma migrate deploy` uit; `worker` verwerkt de achtergrondjobs.
5. Open `/setup` om het beheerdersaccount aan te maken. Telegram stel je daarna in via Instellingen.

Wijzig `APP_SECRET` later niet: opgeslagen geheimen (Telegram/AI) zijn er mee versleuteld.
