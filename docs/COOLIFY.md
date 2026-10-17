# Deployen op Coolify

1. Nieuwe resource uit GitHub (`nielsvg22/Iselectstore_inkoper`, branch `claude/apple-deal-hunter`), build pack **Docker Compose**, bestand `/docker-compose.yml`.
2. Omgevingsvariabelen: `APP_SECRET` (min. 32 tekens, `openssl rand -hex 32`), `POSTGRES_PASSWORD`, optioneel `CRON_SECRET`.
3. Domein bij service `web`: `https://<jouw-domein>:3000` (de app luistert intern op 3000; geen poort naar buiten gepubliceerd).
4. Deploy. `web` voert bij het starten `prisma migrate deploy` uit; `worker` verwerkt de achtergrondjobs.
5. Open `/setup` om het beheerdersaccount aan te maken. Telegram stel je daarna in via Instellingen.

Wijzig `APP_SECRET` later niet: opgeslagen geheimen (Telegram/AI) zijn er mee versleuteld.


## Inkoopradar 2.0 (voorbereid, niet automatisch uitgerold)

Zie [implementatie en bronbeperkingen](RADAR-2-IMPLEMENTATIE.md). Test eerst branch `feature/deal-hunter-2` op een geïsoleerde database. Bij de eerste workerstart worden de profielen van de oudste beheerder herstelbaar gearchiveerd en door één radar vervangen. Maak vooraf ook een normale PostgreSQL-back-up van de doelomgeving. Bestaande profielen/regels/historie blijven in de database; de JSON-profielback-up is in de app te downloaden.

De service `worker` heeft een healthcheck via `scripts/worker-health.ts` en schrijft `worker:heartbeat`. Controleer in Coolify dat deze service echt draait, niet alleen `web`. `unless-stopped` herstart een gecrasht proces; een healthcheck alleen herstart een vastgelopen container niet. Configureer daarvoor het gewenste Coolify-/VPS-toezicht. Houd de bestaande databasevolume-naam bij een uitrol gelijk.

Vercel biedt de webinterface en dagelijkse cron, geen permanente worker. De Vercel-build wijzigt de database niet meer. Pas migraties uitsluitend toe als aparte release-stap tegen de juiste database. De centrale request-gate deelt de bron-pacing tussen web, worker en cron; meerdere workers verhogen het toegestane requestbudget niet.

Voor een serververificatie zijn het echte Coolify-project, de VPS-host en ingestelde toegang nodig. GitHub Preview-deployments bewijzen niet dat de worker op de VPS actief is. Er is in deze sessie geen productie-uitrol uitgevoerd.
