import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/travel_journal_test";

/**
 * End-to-end tests run against a production build (`npm run build` first) using
 * a separate database and storage folder. The database is wiped at the start.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } }],
  webServer: {
    // E2E_DEV=1 runs against `next dev` for quick iteration; the default is the production build.
    command: process.env.E2E_DEV ? `npx next dev -p ${PORT}` : `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL,
      STORAGE_DRIVER: "local",
      STORAGE_DIR: "./storage/e2e-uploads",
      SECURE_COOKIES: "false",
      ALLOW_SIGNUP: "false",
    },
  },
});
