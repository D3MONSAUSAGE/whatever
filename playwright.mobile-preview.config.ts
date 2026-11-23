import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PREVIEW_URL || "http://localhost:3050";

export default defineConfig({
  testDir: "tests/mobile-preview",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  use: { baseURL, trace: "off" },
  projects: [
    { name: "iphone-se", use: { ...devices["iPhone SE"] } },
    { name: "iphone-14", use: { ...(devices["iPhone 14"] || devices["iPhone 13"]) } },
    { name: "iphone-promax", use: { ...(devices["iPhone 14 Pro Max"] || devices["iPhone 13 Pro Max"]) } },
    { name: "pixel-7", use: { ...devices["Pixel 7"] } },
    { name: "galaxy-s", use: { ...(devices["Galaxy S24"] || devices["Galaxy S9+"] || { ...devices["Pixel 7"], viewport: { width: 412, height: 915 } }) } },
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "desktop-1920", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } },
  ],
});
