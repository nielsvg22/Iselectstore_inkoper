// Laadt .env wanneer de worker buiten Next.js draait (lokale ontwikkeling).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const f = join(process.cwd(), ".env");
if (existsSync(f)) {
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
