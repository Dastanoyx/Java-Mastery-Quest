// End-to-end journey (tests/e2e). Run via ../scripts/e2e.sh, which prepares a fresh database, starts the
// app, runs phase 1 (the learning journey), restarts app + database, then runs phase 2 (persistence).
import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const chromium = process.env.PW_CHROMIUM ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "test-results/e2e",
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3200",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: chromium ? { executablePath: chromium } : {},
  },
});
