import { defineConfig, devices } from "@playwright/test";

// Expects the frontend dev server (BASE_URL, default :3000, proxying /ws) and
// the puggietype-server (:2567) to be running already.
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env["BASE_URL"] ?? "http://localhost:3000",
    headless: true,
    trace: "retain-on-failure",
    // skip the ngrok free-tier browser interstitial when testing via a public URL
    extraHTTPHeaders: { "ngrok-skip-browser-warning": "1" },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
