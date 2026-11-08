import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BillingEmailSelfTest, SelfTestResults, selfTestRunId } from "@/components/billing-email-selftest";
import {
  billingNoticeKey, deliverSelfTest, evaluateSelfTestGate, selfTestAllowed, selfTestAttemptSucceeded, selfTestClaimKey, selfTestNotices, selfTestStatus, SELF_TEST_KINDS,
} from "@/lib/server/billing-notices";
import type { EntitlementRow } from "@/lib/server/entitlements";
import { BILLING_EMAIL_FROM, memoryNoticeLedger } from "@/lib/server/transactional-email";

const org = "8a1b9c0d-1111-4222-8333-444455556666";
const row: EntitlementRow = {
  state: "trial", plan: "trial", screen_limit: 5, active_screens: 1, total_screens: 1,
  trial_started_at: "2026-11-01T00:00:00.000Z", trial_ends_at: "2026-11-15T00:00:00.000Z", playback_ends_at: null,
  subscription_status: null, current_period_end: null, cancel_at_period_end: false,
  grace_ends_at: "2026-12-01T00:00:00.000Z",
  playback_allowed: true, can_add_screen: true, server_time: "2026-11-08T00:00:00.000Z",
};

describe("billing email self-test", () => {
  it("tells the dashboard the flag without listing other orgs", () => {
    expect(selfTestStatus(org, undefined)).toEqual({ enabled: false });
    expect(selfTestStatus(org, `other, ${org}`)).toEqual({ enabled: true });
    expect(selfTestRunId(1_700_000_000_000)).toBe("test-1700000000000");
    expect(evaluateSelfTestGate({
      accountId: org, allowlist: org, email: "owner@example.com", run: selfTestRunId(1_700_000_000_000), replay: false, limited: false,
    })).toEqual({ ok: true });
  });
  it("renders the button and results only for an allowlisted org", () => {
    expect(renderToStaticMarkup(createElement(BillingEmailSelfTest, { enabled: false }))).toBe("");
    const shown = renderToStaticMarkup(createElement(BillingEmailSelfTest, { enabled: true }));
    expect(shown).toContain("Send test billing emails");
    expect(shown).not.toContain("selftest-results");
    const table = renderToStaticMarkup(createElement(SelfTestResults, { rows: [{
      kind: "trial_ending_3", sent: true, reason: "sent", id: "re_123", error: null,
    }] }));
    expect(table).toContain("Kind");
    expect(table).toContain("trial_ending_3");
    expect(table).toContain("yes");
    expect(table).toContain("sent");
    expect(table).toContain("re_123");
    expect(table).toContain(">Error<");
  });
  it("does not treat a failed claim as a completed send", () => {
    expect(selfTestAttemptSucceeded([{ sent: false, reason: "failed" }, { sent: false, reason: "noop" }])).toBe(false);
    expect(selfTestAttemptSucceeded([{ sent: true, reason: "sent" }])).toBe(true);
    expect(selfTestAttemptSucceeded([{ sent: false, reason: "duplicate" }])).toBe(true);
  });
  it("allowlists exact org ids and hides everyone else", () => {
    expect(selfTestAllowed(org, undefined)).toBe(false);
    expect(selfTestAllowed(org, "")).toBe(false);
    expect(selfTestAllowed(org, "other-org")).toBe(false);
    expect(selfTestAllowed(org, ` other-org, ${org} `)).toBe(true);
  });
  it("refuses a new run inside the rate limit, and lets the same run id through", () => {
    const base = { accountId: org, allowlist: org, email: "owner@example.com", run: "run-1" };
    expect(evaluateSelfTestGate({ ...base, replay: false, limited: true })).toMatchObject({ ok: false, status: 429 });
    expect(evaluateSelfTestGate({ ...base, replay: true, limited: true })).toEqual({ ok: true });
    expect(evaluateSelfTestGate({ ...base, allowlist: "nope", replay: false, limited: false })).toMatchObject({ ok: false, status: 404 });
    expect(evaluateSelfTestGate({ ...base, email: "", replay: false, limited: false })).toMatchObject({ ok: false, status: 400 });
  });
  it("builds every template from the org dates, marked as a test, on a separate claim key", () => {
    const notices = selfTestNotices(row, "2026-11-08T00:00:00.000Z");
    expect(notices.map((n) => n.kind)).toEqual([...SELF_TEST_KINDS]);
    expect(notices.every((n) => n.subject.startsWith("[TEST] "))).toBe(true);
    expect(notices.find((n) => n.kind === "trial_ending_3")?.deadline).toBe("2026-11-15T00:00:00.000Z");
    expect(notices.find((n) => n.kind === "trial_ending_3")?.text).toContain("Nov 15, 2026 (UTC)");
    expect(notices.find((n) => n.kind === "payment_failed")?.deadline).toBe("2026-12-01T00:00:00.000Z");
    expect(notices.find((n) => n.kind === "grace_ending_1")?.text).toContain("Dec 1, 2026 (UTC)");
    expect(notices.find((n) => n.kind === "transition_14")?.deadline).toBe("2026-11-22T00:00:00.000Z");
    for (const notice of notices) {
      const key = selfTestClaimKey(org, "run-1", notice.kind);
      expect(key.startsWith("selftest:")).toBe(true);
      expect(key).not.toBe(billingNoticeKey(org, notice));
    }
  });
  it("sends once for a run id and nothing on the second call", async () => {
    const notices = selfTestNotices(row, null);
    const ledger = memoryNoticeLedger();
    const env = { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test-key", ALERT_EMAIL_FROM: BILLING_EMAIL_FROM };
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      seen.push(body.to[0]);
      expect(body.subject.startsWith("[TEST] ")).toBe(true);
      expect(JSON.stringify(body)).not.toContain("test-key");
      return new Response(JSON.stringify({ id: `re_${body.subject.length}` }), { status: 200 });
    }) as typeof fetch;
    try {
      const first = await deliverSelfTest({ accountId: org, to: "owner@example.com", run: "run-1", notices, env, ledger });
      const second = await deliverSelfTest({ accountId: org, to: "owner@example.com", run: "run-1", notices, env, ledger });
      expect(first.every((row) => row.sent && row.reason === "sent" && row.id)).toBe(true);
      expect(second.every((row) => row.sent === false && row.reason === "duplicate" && row.id === null)).toBe(true);
      expect(seen).toEqual(Array(notices.length).fill("owner@example.com"));
      expect(JSON.stringify(second)).not.toContain("test-key");
    } finally {
      globalThis.fetch = original;
    }
  });
});
