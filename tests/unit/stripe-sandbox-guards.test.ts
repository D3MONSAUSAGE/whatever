import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  billingDiagnostics,
  billingMode,
  checkoutSessionRequest,
  isLiveStripeKey,
  isProductionSupabaseUrl,
  isTestStripeKey,
  modeBlockedReason,
  planForPrice,
  priceFor,
  stripeKey,
  webhookEventAllowed,
  webhookSecret,
} from "@/lib/server/stripe";

const PROD_SUPABASE = "https://iybmjtkjfxcqupvhoddh.supabase.co";
const STAGING_SUPABASE = "https://staging-sandbox-example.supabase.co";

function runScript(scriptPath: string, args: string[] = [], extra: Record<string, string> = {}) {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        STRIPE_LIVE_ENABLED: "",
        STRIPE_LIVE_SECRET_KEY: "",
        STRIPE_TEST_SECRET_KEY: "",
        STRIPE_WEBHOOK_SECRET: "",
        STRIPE_PRICE_STARTER: "",
        STRIPE_PRICE_BUSINESS: "",
        STRIPE_PRICE_MULTI: "",
        PEKKO_BASE_URL: "",
        PEKKO_ACCESS_TOKEN: "",
        QA_ACCOUNT_ID: "",
        ...extra,
      },
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    const failed = err as { status?: number; stdout?: string; stderr?: string };
    return { code: failed.status ?? 1, stdout: String(failed.stdout ?? ""), stderr: String(failed.stderr ?? "") };
  }
}

describe("Stripe environment & key isolation guards", () => {
  const fullTestVars = {
    STRIPE_TEST_SECRET_KEY: "rk_test_sandbox_123",
    STRIPE_WEBHOOK_SECRET: "whsec_test_123",
    STRIPE_PRICE_STARTER: "price_test_s",
    STRIPE_PRICE_BUSINESS: "price_test_b",
    STRIPE_PRICE_MULTI: "price_test_m",
    NEXT_PUBLIC_SUPABASE_URL: STAGING_SUPABASE,
  };

  const fullLiveVars = {
    STRIPE_LIVE_ENABLED: "1",
    STRIPE_LIVE_SECRET_KEY: "sk_live_prod_123",
    STRIPE_LIVE_WEBHOOK_SECRET: "whsec_live_123",
    STRIPE_LIVE_PRICE_STARTER: "price_live_s",
    STRIPE_LIVE_PRICE_BUSINESS: "price_live_b",
    STRIPE_LIVE_PRICE_MULTI: "price_live_m",
    NEXT_PUBLIC_SUPABASE_URL: PROD_SUPABASE,
  };

  it("recognizes test keys (sk_test_ and rk_test_) and live keys (sk_live_) strictly", () => {
    expect(isTestStripeKey("sk_test_123")).toBe(true);
    expect(isTestStripeKey("rk_test_123")).toBe(true);
    expect(isTestStripeKey("sk_live_123")).toBe(false);
    expect(isTestStripeKey("rk_live_123")).toBe(false);
    expect(isTestStripeKey("")).toBe(false);

    expect(isLiveStripeKey("sk_live_123")).toBe(true);
    expect(isLiveStripeKey("sk_test_123")).toBe(false);
    expect(isLiveStripeKey("rk_test_123")).toBe(false);
    expect(isLiveStripeKey("rk_live_123")).toBe(false);
  });

  it("Production (VERCEL_ENV=production) never loads test keys and fails closed if STRIPE_LIVE_ENABLED != 1", () => {
    const prodMisconfigured = {
      VERCEL_ENV: "production",
      ...fullTestVars,
      STRIPE_LIVE_ENABLED: "0",
      NEXT_PUBLIC_SUPABASE_URL: PROD_SUPABASE,
    };
    expect(billingMode(prodMisconfigured)).toBe("live");
    expect(modeBlockedReason(prodMisconfigured)).toBe("production_flag_off");
    expect(stripeKey(prodMisconfigured)).toBeNull();
    expect(webhookSecret(prodMisconfigured)).toBe("");
    expect(priceFor("multi", prodMisconfigured)).toBeNull();
    expect(planForPrice("price_test_m", prodMisconfigured)).toBeNull();
    expect(webhookEventAllowed(false, prodMisconfigured)).toBe(false);
    expect(webhookEventAllowed(true, prodMisconfigured)).toBe(false);

    const prodWithTestKeyInLiveSlot = {
      VERCEL_ENV: "production",
      ...fullLiveVars,
      STRIPE_LIVE_SECRET_KEY: "rk_test_wrong_slot",
    };
    expect(stripeKey(prodWithTestKeyInLiveSlot)).toBeNull();

    const prodHealthy = { VERCEL_ENV: "production", ...fullLiveVars, ...fullTestVars, NEXT_PUBLIC_SUPABASE_URL: PROD_SUPABASE };
    expect(modeBlockedReason(prodHealthy)).toBeNull();
    expect(stripeKey(prodHealthy)).toBe("sk_live_prod_123");
    expect(webhookSecret(prodHealthy)).toBe("whsec_live_123");
    expect(priceFor("multi", prodHealthy)).toBe("price_live_m");
    expect(planForPrice("price_test_m", prodHealthy)).toBeNull();
    expect(webhookEventAllowed(true, prodHealthy)).toBe(true);
    expect(webhookEventAllowed(false, prodHealthy)).toBe(false);
  });

  it("Preview (VERCEL_ENV=preview) never loads live keys and fails closed if STRIPE_LIVE_ENABLED=1", () => {
    const previewWithLiveFlag = {
      VERCEL_ENV: "preview",
      ...fullLiveVars,
      ...fullTestVars,
      STRIPE_LIVE_ENABLED: "1",
    };
    expect(billingMode(previewWithLiveFlag)).toBe("test");
    expect(modeBlockedReason(previewWithLiveFlag)).toBe("preview_live_forbidden");
    expect(stripeKey(previewWithLiveFlag)).toBeNull();
    expect(webhookSecret(previewWithLiveFlag)).toBe("");
    expect(priceFor("business", previewWithLiveFlag)).toBeNull();
    expect(webhookEventAllowed(true, previewWithLiveFlag)).toBe(false);
    expect(webhookEventAllowed(false, previewWithLiveFlag)).toBe(false);
    expect(billingDiagnostics(previewWithLiveFlag).rejected).toContain("STRIPE_LIVE_ENABLED");
  });

  it("Preview fails closed when NEXT_PUBLIC_SUPABASE_URL still points to Production Supabase", () => {
    expect(isProductionSupabaseUrl(PROD_SUPABASE)).toBe(true);
    expect(isProductionSupabaseUrl(STAGING_SUPABASE)).toBe(false);

    const previewSharingProdDb = {
      VERCEL_ENV: "preview",
      ...fullTestVars,
      NEXT_PUBLIC_SUPABASE_URL: PROD_SUPABASE,
    };
    expect(modeBlockedReason(previewSharingProdDb)).toBe("preview_db_not_isolated");
    expect(stripeKey(previewSharingProdDb)).toBeNull();
    expect(webhookSecret(previewSharingProdDb)).toBe("");
    expect(webhookEventAllowed(false, previewSharingProdDb)).toBe(false);
    const diag = billingDiagnostics(previewSharingProdDb);
    expect(diag.databaseIsolated).toBe(false);
    expect(diag.available).toBe(false);
    expect(diag.rejected).toContain("NEXT_PUBLIC_SUPABASE_URL");

    const previewIsolated = {
      VERCEL_ENV: "preview",
      ...fullTestVars,
      NEXT_PUBLIC_SUPABASE_URL: STAGING_SUPABASE,
    };
    expect(modeBlockedReason(previewIsolated)).toBeNull();
    expect(stripeKey(previewIsolated)).toBe("rk_test_sandbox_123");
    expect(webhookSecret(previewIsolated)).toBe("whsec_test_123");
    expect(webhookEventAllowed(false, previewIsolated)).toBe(true);
    expect(webhookEventAllowed(true, previewIsolated)).toBe(false);
    expect(billingDiagnostics(previewIsolated)).toMatchObject({
      mode: "test",
      databaseIsolated: true,
      available: true,
      webhook: true,
      rejected: [],
    });
  });

  it("checkoutSessionRequest accepts rk_test_ and rejects mismatched mode/key prefixes", () => {
    const base = {
      price: "price_test_b",
      accountId: "acct_1",
      email: "owner@example.com",
      customerId: null,
      origin: "https://preview.example",
      managedPayments: undefined,
    };
    const rk = checkoutSessionRequest({ ...base, secretKey: "rk_test_123", mode: "test" });
    expect(rk.ok).toBe(true);
    if (rk.ok) expect(rk.params.managed_payments).toEqual({ enabled: false });

    const mismatchLive = checkoutSessionRequest({ ...base, secretKey: "sk_test_123", mode: "live", managedPayments: "0" });
    expect(mismatchLive.ok).toBe(false);

    const mismatchTest = checkoutSessionRequest({ ...base, secretKey: "sk_live_123", mode: "test", managedPayments: "0" });
    expect(mismatchTest.ok).toBe(false);

    const invalid = checkoutSessionRequest({ ...base, secretKey: "not_a_key" });
    expect(invalid.ok).toBe(false);
  });
});

describe("sandbox scripts refuse production URLs and live keys", () => {
  it("stripe-sandbox-e2e skips cleanly when STRIPE_TEST_SECRET_KEY is unset and refuses live/prod targets", () => {
    const skipped = runScript("scripts/stripe-sandbox-e2e.mjs");
    expect(skipped.code).toBe(0);
    expect(skipped.stdout).toContain("skipped");

    const liveFlag = runScript("scripts/stripe-sandbox-e2e.mjs", [], {
      STRIPE_LIVE_ENABLED: "1",
      STRIPE_TEST_SECRET_KEY: "rk_test_123",
    });
    expect(liveFlag.code).not.toBe(0);
    expect(liveFlag.stderr).toMatch(/STRIPE_LIVE_ENABLED/);

    const liveKey = runScript("scripts/stripe-sandbox-e2e.mjs", [], {
      STRIPE_TEST_SECRET_KEY: "sk_live_123",
    });
    expect(liveKey.code).not.toBe(0);
    expect(liveKey.stderr).toMatch(/rk_test_|sk_test_/);

    const prodUrl = runScript("scripts/stripe-sandbox-e2e.mjs", [], {
      STRIPE_TEST_SECRET_KEY: "rk_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      STRIPE_PRICE_STARTER: "price_s",
      STRIPE_PRICE_BUSINESS: "price_b",
      STRIPE_PRICE_MULTI: "price_m",
      PEKKO_BASE_URL: "https://pekkotv.com",
      PEKKO_ACCESS_TOKEN: "tok",
      QA_ACCOUNT_ID: "acct",
    });
    expect(prodUrl.code).not.toBe(0);
    expect(prodUrl.stderr).toMatch(/production/i);
  });

  it("stripe-test-setup and stripe-portal-setup refuse STRIPE_LIVE_ENABLED=1 and live keys", () => {
    for (const script of ["scripts/stripe-test-setup.mjs", "scripts/stripe-portal-setup.mjs"]) {
      const liveFlag = runScript(script, [], { STRIPE_LIVE_ENABLED: "1", STRIPE_TEST_SECRET_KEY: "rk_test_123" });
      expect(liveFlag.code).not.toBe(0);
      const liveKey = runScript(script, [], { STRIPE_TEST_SECRET_KEY: "sk_live_123" });
      expect(liveKey.code).not.toBe(0);
    }
  });
});
