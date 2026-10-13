import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173/travel-atlas/",
    launchOptions: { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } }],
  webServer: { command: "node scripts/serve-pages.mjs", url: "http://localhost:4173/travel-atlas/", reuseExistingServer: false },
});
