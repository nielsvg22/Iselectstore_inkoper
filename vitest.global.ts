import { execSync } from "node:child_process";

/** Zorgt dat de testdatabase het actuele schema heeft. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://dealhunter:dealhunter@localhost:5432/dealhunter_test";
  try {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  } catch (e) {
    console.warn("[tests] migrate deploy mislukt (integratietests worden mogelijk overgeslagen):", (e as Error).message.slice(0, 200));
  }
}
