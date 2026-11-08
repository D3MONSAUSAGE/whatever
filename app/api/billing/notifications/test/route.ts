import { requireAdmin } from "@/lib/server/auth";
import { deliverSelfTest, evaluateSelfTestGate, selfTestAllowed, selfTestAttemptSucceeded, selfTestClaimKey, selfTestNotices, selfTestStatus, SELF_TEST_KINDS } from "@/lib/server/billing-notices";
import { loadEntitlement } from "@/lib/server/entitlements";
import { enforceLimit, fail, json, readJson, releaseLimit } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";
import { supabaseNoticeLedger } from "@/lib/server/transactional-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_SECONDS = 600;

/** Reads the stored transition start. Does not write it. */
async function readTransitionStart(accountId: string): Promise<string | null> {
  const row = await db().from("accounts").select("billing_transition_started_at").eq("id", accountId).maybeSingle();
  if (row.error || !row.data?.billing_transition_started_at) return null;
  return String(row.data.billing_transition_started_at);
}

/** Tells the dashboard whether to show the self-test control. No emails and no entitlement writes. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  return json(selfTestStatus(admin.accountId, process.env.BILLING_EMAIL_SELFTEST_ORGS));
}

/**
 * Sends the six billing templates to the signed-in owner only.
 * Allowlisted orgs, one new run per 10 minutes. Does not change entitlements,
 * enforcement, or the keys used by real reminders.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const allowlist = process.env.BILLING_EMAIL_SELFTEST_ORGS;
  if (!selfTestAllowed(admin.accountId, allowlist)) return json({ error: "Not found." }, 404);
  const body = await readJson(req);
  const run = typeof body.run === "string" ? body.run.trim() : "";
  const ledger = supabaseNoticeLedger();
  const runOk = /^[A-Za-z0-9_-]{1,64}$/.test(run);
  const replay = runOk ? await selfTestRunClaimed(ledger, admin.accountId, run) : false;
  const gate = evaluateSelfTestGate({ accountId: admin.accountId, allowlist, email: admin.email, run, replay, limited: false });
  if (!gate.ok) return json({ error: gate.error }, gate.status);
  const limitKey = `billing-selftest:${admin.accountId}`;
  if (!replay) {
    const hit = await enforceLimit(
      limitKey,
      WINDOW_SECONDS,
      1,
      "A test email was just sent. Wait 10 minutes before sending another.",
    );
    if (hit) return hit;
  }

  const entitlement = await loadEntitlement(admin.accountId);
  if (entitlement === "error" || !entitlement) {
    if (!replay) await releaseLimit(limitKey);
    return fail("Couldn't load your plan. Try again.", 503);
  }
  const started = await readTransitionStart(admin.accountId);
  const templates = await deliverSelfTest({
    accountId: admin.accountId,
    to: admin.email,
    run,
    notices: selfTestNotices(entitlement, started),
    ledger,
  });
  // A ledger or provider failure did not send mail, so it must not burn the 10-minute window.
  if (!replay && !selfTestAttemptSucceeded(templates)) await releaseLimit(limitKey);
  return json({ run, templates });
}

async function selfTestRunClaimed(ledger: { has(id: string): Promise<boolean> }, accountId: string, run: string) {
  for (const kind of SELF_TEST_KINDS) {
    if (await ledger.has(selfTestClaimKey(accountId, run, kind))) return true;
  }
  return false;
}
