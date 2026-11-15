import { HttpError } from "./auth";
import { APELDOORN_RADAR_NAME } from "./radar/apeldoorn";

/** Alleen voor tests en lokaal ontwikkelen. In productie staat dit niet aan: de zoekprofielen staan vast. */
export const customProfilesAllowed = () => process.env.ALLOW_CUSTOM_PROFILES === "1";

/** De twee vaste profielen: Marktplaats (Smart Inkoopradar) en Vinted. Alles anders is een eigen profiel. */
export const isSystemProfile = (p: { name: string; sourceConfig: unknown }): boolean =>
  p.name === APELDOORN_RADAR_NAME || (p.sourceConfig as { platform?: string } | null)?.platform === "vinted";

export const LOCKED_MESSAGE =
  "Het zoekprofiel staat vast, zoals Twan het wil. Wat er gezocht wordt volgt uit de modellenlijst en de inkoopregels; eigen profielen kunnen niet worden aangemaakt, aangepast of verwijderd.";

export function assertCustomProfilesAllowed(): void {
  if (!customProfilesAllowed()) throw new HttpError(403, LOCKED_MESSAGE);
}
