import { redact } from "./security/crypto";

type Level = "debug" | "info" | "warn" | "error";
export function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && !process.env.LOG_IN_TESTS) return;
  const safeMeta = meta ? redact(JSON.stringify(meta, (_k, v) => (v instanceof Error ? v.message : v))) : "";
  // Geen persoonsgegevens/secrets loggen: alleen ids en technische context meegeven.
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(`[${new Date().toISOString()}] ${level.toUpperCase()} ${redact(msg)} ${safeMeta}`);
}

export const errMsg = (e: unknown): string => redact(e instanceof Error ? e.message : String(e)).slice(0, 500);
