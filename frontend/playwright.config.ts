import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BLOG_E2E_ORIGIN;
if (!baseURL) throw new Error("Run npm run test:e2e to start the isolated test site.");

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  forbidOnly: true,
  timeout: 60_000,
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: "**/publishing.spec.ts", use: { ...devices["Pixel 7"] } },
  ],
});
