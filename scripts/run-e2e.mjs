import { spawnSync } from "node:child_process";

if (!process.env.BASE_URL) {
  console.log("Skipping Playwright e2e: BASE_URL is not set.");
  console.log("Point BASE_URL at a deployed Pantalla origin, then run: npx playwright install chromium && npm run test:e2e");
  process.exit(0);
}

const result = spawnSync("npx", ["playwright", "test"], { stdio: "inherit" });
process.exit(result.status ?? 1);
