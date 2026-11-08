import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function run(args: string[], extra: Record<string, string> = {}) {
  try {
    const stdout = execFileSync(process.execPath, ["scripts/stripe-live-setup.mjs", ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        STRIPE_LIVE_ENABLED: "",
        STRIPE_LIVE_SECRET_KEY: "",
        STRIPE_TEST_SECRET_KEY: "sk_test_must_not_be_used",
        ...extra,
      },
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    const failed = err as { status?: number; stdout?: string; stderr?: string };
    return { code: failed.status ?? 1, stdout: String(failed.stdout ?? ""), stderr: String(failed.stderr ?? "") };
  }
}

describe("stripe live setup", () => {
  it("dry-run prints the live prices and webhook and does not call Stripe", () => {
    const result = run([]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("dry-run");
    expect(result.stdout).toContain("https://pekkotv.com/api/billing/webhook");
    expect(result.stdout).toContain("pekko_starter_monthly_usd $19/month");
    expect(result.stdout).toContain("pekko_business_monthly_usd $39/month");
    expect(result.stdout).toContain("pekko_multiscreen_monthly_usd $59/month");
    expect(result.stdout).not.toContain("sk_test_must_not_be_used");
    expect(result.stdout).not.toMatch(/STRIPE_LIVE_WEBHOOK_SECRET=whsec/);
  });
  it("refuses --confirm-live while the flag is off or the key is not sk_live_", () => {
    const off = run(["--confirm-live"]);
    expect(off.code).not.toBe(0);
    expect(off.stderr).toMatch(/STRIPE_LIVE_ENABLED/);
    const testKey = run(["--confirm-live"], { STRIPE_LIVE_ENABLED: "1", STRIPE_LIVE_SECRET_KEY: "sk_test_nope" });
    expect(testKey.code).not.toBe(0);
    expect(testKey.stderr).toMatch(/sk_live_/);
    expect(testKey.stderr).not.toContain("created");
  });
});
