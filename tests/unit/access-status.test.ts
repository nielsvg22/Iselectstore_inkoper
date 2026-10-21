import { describe, expect, it } from "vitest";
import { accessStatus, type AccessEvidence } from "@/lib/sources/access-status";
import { isBotChallenge } from "@/lib/sources/safe-fetch";
import { inCityScope } from "@/lib/radar/locality";

const now = Date.parse("2026-10-21T12:00:00Z");
const at = (seconds: number) => new Date(now + seconds * 1000).toISOString();
const base: AccessEvidence = { enabled: true, hasProfiles: true, lastSuccessAt: at(-20), lastError: null, lastErrorAt: null, staleAfterMs: 120000 };

describe("bronstatus uit daadwerkelijk bewijs", () => {
  it("maakt onbekende/oude/toekomstige controles niet groen", () => {
    expect(accessStatus({ ...base, lastSuccessAt: null }, now).state).toBe("unknown");
    expect(accessStatus({ ...base, lastSuccessAt: at(-300) }, now).state).toBe("stale");
    expect(accessStatus({ ...base, lastSuccessAt: at(20) }, now).state).toBe("unknown");
    expect(accessStatus(base, now).state).toBe("healthy");
  });
  it.each([[403, "forbidden"], [429, "rate_limited"], [401, "unauthorized"]])("toont HTTP %i zonder een IP-ban te claimen", (code, state) => {
    const s = accessStatus({ ...base, pause: { at: at(-1), until: code === 401 ? null : at(900), reason: `HTTP ${code}` } }, now);
    expect(s).toMatchObject({ state, httpStatus: code });
    if (code !== 429) expect(s.detail).toMatch(/niet bewezen|geen IP-ban/);
  });
  it("geeft actieve detail-/robots-pauzes voorrang boven een geslaagde zoekcontrole", () => {
    expect(accessStatus({ ...base, pause: { at: at(-1), until: at(900), reason: "robots.txt HTTP 429" } }, now).state).toBe("rate_limited");
    expect(accessStatus({ ...base, pause: { at: at(-1), until: at(900), reason: "Botcontrole (CAPTCHA)" } }, now).state).toBe("challenge");
  });
  it("vraagt na afloop van de pauze nieuw succes voordat het herstel bevestigt", () => {
    const pause = { at: at(-1200), until: at(-10), reason: "HTTP 403" };
    expect(accessStatus({ ...base, pause }, now).state).toBe("recovering");
    expect(accessStatus({ ...base, pause, lastSuccessAt: at(-5) }, now)).toMatchObject({ state: "healthy", pauseUntil: null, lastIncidentAt: at(-1200) });
  });
  it("onderscheidt configuratie en een ontbrekend profiel van blokkades", () => {
    expect(accessStatus({ ...base, enabled: false }, now).state).toBe("disabled");
    expect(accessStatus({ ...base, configured: false }, now).state).toBe("unconfigured");
    expect(accessStatus({ ...base, hasProfiles: false }, now).state).toBe("idle");
  });
  it("maakt een bronstoring geen IP-ban en laat oude fouten geen herstel verbergen", () => {
    expect(accessStatus({ ...base, lastErrorAt: at(-5), lastError: "HTTP 500" }, now).state).toBe("error");
    expect(accessStatus({ ...base, lastErrorAt: at(-5), lastError: "robots.txt niet beschikbaar" }, now).detail).toContain("geen IP-ban");
    expect(accessStatus({ ...base, lastErrorAt: at(-40), lastError: "HTTP 403" }, now).state).toBe("healthy");
  });
  it("herkent een botcontrole, zonder een gewone advertentie met het woord captcha te blokkeren", () => {
    expect(isBotChallenge("<html><h1>Robot check CAPTCHA</h1></html>")).toBe(true);
    expect(isBotChallenge('<script id="__NEXT_DATA__">{"title":"captcha"}</script>')).toBe(false);
    expect(isBotChallenge('<script type="application/ld+json">{"title":"captcha"}</script>')).toBe(false);
  });
});

describe("uitsluitend de plaats Apeldoorn", () => {
  it.each(["Apeldoorn", "apeldoorn", " APELDOORN "])("staat %s toe", place => expect(inCityScope(place, "Apeldoorn")).toBe(true));
  it.each(["Ugchelen", "Beekbergen", "Omgeving Apeldoorn", "Apeldoorn-Zwolle", null, ""])("sluit %s uit, ook bij verzending of onbekende afstand", place => expect(inCityScope(place, "Apeldoorn")).toBe(false));
  it("herstelt brede dekking wanneer de teststand uitstaat", () => expect(inCityScope(null, "")).toBe(true));
});
