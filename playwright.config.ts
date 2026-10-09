import { randomBytes, scryptSync } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

// Throwaway secrets for this test run only.
export const E2E_PIN = "2468";
const salt = randomBytes(16);
const pinHash = `scrypt:16384:8:1:${salt.toString("base64url")}:${scryptSync(E2E_PIN, salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64url")}`;
process.env.E2E_API_TOKEN ??= randomBytes(24).toString("base64url");
process.env.E2E_LINK_SECRET ??= randomBytes(32).toString("base64url");
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["iPhone 13"], // 390×844
    browserName: "chromium",
    locale: "he-IL",
  },
  webServer: {
    command: `rm -rf .data/e2e && next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      PGLITE_DIR: ".data/e2e",
      APP_URL: `http://localhost:${PORT}`, // override any value from .env.local
      DATABASE_URL: "",
      API_TOKEN: process.env.E2E_API_TOKEN,
      PIN_HASH: pinHash,
      SESSION_SECRET: randomBytes(32).toString("base64url"),
      ACCESS_LINK_SECRET: process.env.E2E_LINK_SECRET,
    },
  },
});
