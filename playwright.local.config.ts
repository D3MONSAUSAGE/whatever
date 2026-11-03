import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e-local", workers: 1, retries: 0,
  use: { baseURL: process.env.BASE_URL || "http://localhost:3100" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
