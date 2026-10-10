import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const chromium = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome-linux/chrome"].find(existsSync);
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://dealhunter:dealhunter@localhost:5432/dealhunter_e2e";
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: chromium ? { executablePath: chromium, args: ["--no-sandbox"] } : { args: ["--no-sandbox"] },
    screenshot: "only-on-failure",
    trace: "off",
  },
  webServer: {
    command: `npx prisma migrate deploy && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DB,
      APP_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
      CRON_SECRET: "e2e-cron-secret-1234567890",
      INSECURE_COOKIES: "1",
      NODE_ENV: "production",
    },
  },
});
