export interface AccessEvidence {
  enabled: boolean;
  configured?: boolean;
  hasProfiles: boolean;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  staleAfterMs: number;
  pause?: { until: string | null; at: string | null; reason: string } | null;
}

const timestamp = (v: string | null | undefined) => {
  const n = v ? Date.parse(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Only classify observed source evidence. HTTP 403 never proves an IP ban. */
export function accessStatus(e: AccessEvidence, now = Date.now()) {
  const success = timestamp(e.lastSuccessAt);
  const pauseUntil = timestamp(e.pause?.until);
  const incidentAt = timestamp(e.pause?.at);
  const errorAt = timestamp(e.lastErrorAt);
  const paused = !!e.pause && (e.pause.until === null || (pauseUntil !== null && pauseUntil > now));
  const recovered = !!e.pause && success !== null && success <= now &&
    success > (pauseUntil ?? incidentAt ?? Infinity);
  const errorCurrent = !!e.lastError && (errorAt === null || success === null || errorAt >= success);
  const reason = paused || (e.pause && !recovered) ? e.pause?.reason ?? "" : errorCurrent ? e.lastError ?? "" : "";
  const httpStatus = /\bHTTP\s+(\d{3})\b/i.exec(reason)?.[1] ?? null;
  const common = { lastSuccessAt: e.lastSuccessAt, lastIncidentAt: e.pause?.at ?? e.lastErrorAt,
    pauseUntil: paused ? e.pause?.until ?? null : null, httpStatus: httpStatus ? Number(httpStatus) : null };
  const result = (state: string, tone: "neutral" | "success" | "warning" | "danger", title: string, detail: string) =>
    ({ ...common, state, tone, title, detail });
  if (!e.enabled) return result("disabled", "neutral", "Uitgeschakeld", "Deze bron is niet ingeschakeld. Er worden geen zoekrequests uitgevoerd.");
  if (e.configured === false) return result("unconfigured", "neutral", "Toegang nog niet ingesteld", "Goedgekeurde API-toegang en een eigen OAuth-token zijn nodig voordat deze bron kan zoeken.");
  if (paused) {
    if (httpStatus === "429") return result("rate_limited", "warning", "Requestlimiet bereikt", "Marktplaats gaf HTTP 429. De scraper wacht en probeert het na de bronpauze rustig opnieuw.");
    if (httpStatus === "401") return result("unauthorized", "danger", "Autorisatie vereist", "De API gaf HTTP 401. Herautoriseer het eigen OAuth-token; dit bewijst geen IP-ban.");
    if (httpStatus === "403") return result("forbidden", "danger", "Toegang geweigerd", "Marktplaats gaf HTTP 403. Dit kan een toegangsbeperking zijn; een IP-ban is hiermee niet bewezen.");
    if (/captcha|botcontrole|robot check/i.test(reason)) return result("challenge", "danger", "Botcontrole ontvangen", "De bron toont een botcontrole. Automatisch ophalen is gepauzeerd; de controle wordt niet omzeild.");
    return result("paused", "warning", "Bron tijdelijk gepauzeerd", "Er worden tijdens deze bronpauze geen nieuwe zoekrequests uitgevoerd.");
  }
  if (!e.hasProfiles) return result("idle", "neutral", "Geen actieve zoekopdracht", "Schakel een zoekprofiel voor deze bron in om nieuwe advertenties te ontdekken.");
  if (e.pause && !recovered) return result("recovering", "warning", "Herstel nog niet bevestigd", "De pauze is verstreken. Een volgende geslaagde zoekcontrole moet bevestigen dat de bron weer werkt.");
  if (errorCurrent) {
    if (httpStatus === "403") return result("forbidden", "danger", "Toegang geweigerd", "Een zoekcontrole meldt HTTP 403. Dit bewijst geen IP-ban; controleer de bronpauze en toegangsrechten.");
    if (httpStatus === "429") return result("rate_limited", "warning", "Requestlimiet bereikt", "Een zoekcontrole meldt HTTP 429. De bronlimiet is bereikt; dit is geen bevestigde IP-ban.");
    if (/captcha|botcontrole|robot check/i.test(reason)) return result("challenge", "danger", "Botcontrole ontvangen", "Een broncontrole meldt een CAPTCHA of botcontrole. Dit wordt niet omzeild.");
    return result("error", "warning", "Broncontrole mislukt", /robots\.txt/i.test(reason)
      ? "De toegangsregels konden niet worden gecontroleerd. Dit bewijst geen IP-ban."
      : "Een controle is mislukt. Een timeout, bronstoring of gewijzigd paginaformaat kan hiervan de oorzaak zijn; een IP-ban is niet vastgesteld.");
  }
  if (success === null || success > now) return result("unknown", "neutral", "Nog geen bevestigde controle", "Er is nog geen geldig tijdstip van een geslaagde zoekcontrole beschikbaar.");
  if (now - success > e.staleAfterMs) return result("stale", "warning", "Geen recente zoekcontrole", "Het laatste succes is ouder dan verwacht. Controleer de worker en de actieve zoekopdracht; een IP-ban is niet vastgesteld.");
  return result("healthy", "success", "Zoeken werkt", "De laatste zoekcontrole is geslaagd. Er is geen actieve bronpauze; dit garandeert geen toekomstige toegang.");
}
