"use client";

export type PushSupport = "unsupported" | "needs-install" | "denied" | "ready";

export const isStandalone = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
export const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

/** iOS ondersteunt Web Push alleen voor webapps die op het beginscherm staan (iOS/iPadOS 16.4+). */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const has = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!has) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (isIos() && !isStandalone()) return "needs-install";
  if (Notification.permission === "denied") return "denied";
  return "ready";
}

export function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export interface Platform { os: "mac" | "windows" | "ios" | "android" | "other"; browser: "safari" | "chrome" | "edge" | "firefox" | "other" }

/** Grove herkenning van besturingssysteem en browser, alleen voor gerichte uitleg bij meldingen. */
export function platformOf(ua: string): Platform {
  const os: Platform["os"] = /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : /Macintosh|Mac OS X/.test(ua) ? "mac" : /Windows/.test(ua) ? "windows" : "other";
  const browser: Platform["browser"] = /Edg\//.test(ua) ? "edge" : /Firefox\//.test(ua) ? "firefox" : /Chrome\/|CriOS\//.test(ua) ? "chrome" : /Safari\//.test(ua) ? "safari" : "other";
  return { os, browser };
}

/** Wat te controleren als een testpush verstuurd is maar niets verschijnt. */
export function deliveryHint(p: Platform): string {
  const browser = { safari: "Safari", chrome: "Google Chrome", edge: "Microsoft Edge", firefox: "Firefox", other: "je browser" }[p.browser];
  if (p.os === "mac") return `Zie je niets op deze Mac? Controleer: Systeeminstellingen → Meldingen → ${browser} (Meldingen toestaan, stijl Banners of Meldingen), zet Focus/Niet storen uit en laat ${browser} open staan (ook op de achtergrond). In ${browser} moet meldingen voor deze site op Toestaan staan.`;
  if (p.os === "windows") return `Zie je niets? Controleer Instellingen → Systeem → Meldingen (${browser} aan, Focusassistent uit) en laat ${browser} open staan.`;
  if (p.os === "ios") return "Zie je niets? Open de app via het beginscherm-icoon, controleer Instellingen → Meldingen → deze app en zet Focus uit.";
  return `Zie je niets? Controleer de meldingsinstellingen van ${browser} en van je systeem, en zet Niet storen uit.`;
}

/** Vertaalt technische aanmeldfouten naar iets waar de gebruiker iets mee kan. */
export function friendlyPushError(e: unknown, p: Platform): string {
  const name = (e as { name?: string })?.name ?? "";
  const msg = (e as Error)?.message ?? "";
  if (name === "NotAllowedError" || /permission/i.test(msg)) return "Meldingen zijn geblokkeerd voor deze site. Zet ze op Toestaan in de site-instellingen van de browser en probeer opnieuw.";
  if (name === "AbortError" || /push service|registration failed/i.test(msg)) return p.browser === "safari" ? "Safari kon zich niet aanmelden bij de pushdienst. Werk macOS/Safari bij, of gebruik Google Chrome." : "De pushdienst van de browser weigerde de aanmelding. Controleer je internetverbinding en schakel een VPN of adblocker uit, of probeer een andere browser.";
  if (name === "InvalidStateError") return "De browser heeft al een oude aanmelding. Klik op 'Uitschakelen op dit apparaat' en schakel daarna opnieuw in.";
  return msg || "Aanmelden voor pushmeldingen is mislukt.";
}

/** Korte vingerafdruk van een push-endpoint (zodat de server kan zeggen "dit apparaat" zonder het endpoint terug te geven). */
export async function endpointId(endpoint: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** Is het abonnement gemaakt met de huidige VAPID-sleutel van de server? Een oud abonnement met een andere sleutel levert nooit meer meldingen op. */
export function sameKey(sub: { options?: { applicationServerKey?: ArrayBuffer | null } }, publicKey: string): boolean {
  const have = sub.options?.applicationServerKey;
  if (!have) return true; // niet te controleren (oudere browsers): niet ten onrechte vernieuwen
  const a = new Uint8Array(have);
  const b = urlBase64ToUint8Array(publicKey);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
