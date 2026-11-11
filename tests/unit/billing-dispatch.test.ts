import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  planOrgReminders, remindersEnabled, runBillingDispatcher, transitionNoticeKey, type DispatchIO, type ReminderAccount,
} from "@/lib/server/billing-dispatch";
import { PLAYBACK_GRACE_DAYS, TRIAL_DAYS } from "@/lib/server/entitlements";

const now = "2026-11-08T00:00:00.000Z";
const inactive: ReminderAccount = {
  id: "65310cfc-a046-451c-8912-d73cb986747e",
  email: "owner@example.com",
  plan: "grandfathered",
  state: "grandfathered",
  trial_started_at: null,
  trial_ends_at: null,
  playback_ends_at: null,
  grace_ends_at: null,
  subscription_status: null,
  current_period_end: null,
  transition_started_at: null,
};

function io(account: ReminderAccount, sendOk: boolean) {
  const delivered = new Set<string>();
  const probe = { sends: 0, stamps: [] as string[], claims: [] as string[] };
  const dispatch: DispatchIO = {
    now,
    list: async () => [account],
    hasDelivered: async (key) => delivered.has(key),
    claim: async (notice) => {
      if (delivered.has(notice.id)) return false;
      delivered.add(notice.id);
      probe.claims.push(notice.id);
      return true;
    },
    send: async (to) => {
      expect(to).toBe("owner@example.com");
      probe.sends += 1;
      return sendOk ? { ok: true, error: null } : { ok: false, error: "resend 500" };
    },
    stamp: async (_id, startedAt) => {
      probe.stamps.push(startedAt);
      return true;
    },
  };
  return { dispatch, probe };
}

describe("billing reminder dispatcher", () => {
  it("keeps the 14-day trial separate from the 3-day playback grace", () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(PLAYBACK_GRACE_DAYS).toBe(3);
    const sql = readFileSync("supabase/migrations/0013_billing_entitlements.sql", "utf8");
    expect(sql).toMatch(/trial_ends_at set default now\(\) \+ interval '14 days'/);
    expect(sql).toMatch(/v_playback_end := v_trial_end \+ interval '3 days'/);
    const route = readFileSync("app/api/entitlements/route.ts", "utf8");
    expect(route).not.toMatch(/readOrStartTransition|\.update\(/);
    const reader = readFileSync("lib/server/entitlements.ts", "utf8");
    expect(reader).not.toMatch(/function readOrStartTransition/);
  });

  it("plans the existing-customer notice for an org that never signs in", () => {
    const planned = planOrgReminders(inactive, now);
    const notice = planned.find((item) => item.kind === "transition_14");
    expect(notice?.deadline).toBe("2026-11-22T00:00:00.000Z");
    expect(notice?.text).toContain("Nov 21, 2026 at 4:00 PM PST");
    expect(notice?.text).toMatch(/full access/i);
    expect(notice?.claimKey).toBe(transitionNoticeKey(inactive.id));
    expect(notice?.transitionStart).toBe(now);
  });

  it("does not stamp or claim when delivery fails, and retries on the next run", async () => {
    const failing = io(inactive, false);
    const first = await runBillingDispatcher({ enabled: true, dryRun: false, io: failing.dispatch });
    expect(first.stamped).toBe(0);
    expect(first.sent).toBe(0);
    expect(first.failed).toBe(1);
    expect(failing.probe.stamps).toEqual([]);
    expect(failing.probe.claims).toEqual([]);
    expect(failing.probe.sends).toBe(1);
    expect(JSON.stringify(first)).not.toContain("owner@example.com");

    const retry = io(inactive, true);
    const second = await runBillingDispatcher({ enabled: true, dryRun: false, io: retry.dispatch });
    expect(second.sent).toBe(1);
    expect(second.stamped).toBe(1);
    expect(retry.probe.stamps).toEqual([now]);
    expect(retry.probe.claims).toEqual([transitionNoticeKey(inactive.id)]);

    const again = io(inactive, true);
    again.dispatch.hasDelivered = async () => true;
    const third = await runBillingDispatcher({ enabled: true, dryRun: false, io: again.dispatch });
    expect(third.sent).toBe(0);
    expect(again.probe.sends).toBe(0);
    expect(again.probe.stamps).toEqual([]);
  });

  it("sends a 3-day trial reminder from server dates without a transition stamp", async () => {
    const trial: ReminderAccount = {
      ...inactive,
      id: "11111111-1111-4111-8111-111111111111",
      plan: "trial",
      state: "trial",
      trial_ends_at: "2026-11-15T00:00:00.000Z",
    };
    const planned = planOrgReminders(trial, "2026-11-12T00:00:00.000Z");
    expect(planned.map((item) => item.kind)).toEqual(["trial_ending_3"]);
    expect(planned[0].transitionStart).toBeNull();
    const harness = io(trial, true);
    harness.dispatch.now = "2026-11-12T00:00:00.000Z";
    const result = await runBillingDispatcher({ enabled: true, dryRun: false, io: harness.dispatch });
    expect(result.sent).toBe(1);
    expect(result.stamped).toBe(0);
    expect(harness.probe.stamps).toEqual([]);
  });

  it("changes nothing while reminders are off, and a dry run does not send", async () => {
    let listed = false;
    const harness = io(inactive, true);
    harness.dispatch.list = async () => { listed = true; return [inactive]; };
    const off = await runBillingDispatcher({ enabled: false, dryRun: false, io: harness.dispatch });
    expect(remindersEnabled({})).toBe(false);
    expect(remindersEnabled({ BILLING_REMINDERS: "true" })).toBe(false);
    expect(off).toMatchObject({ enabled: false, sent: 0, stamped: 0, orgs: [] });
    expect(listed).toBe(false);
    expect(harness.probe.sends).toBe(0);

    const preview = await runBillingDispatcher({ enabled: true, dryRun: true, io: harness.dispatch });
    expect(preview.dryRun).toBe(true);
    expect(preview.sent).toBe(0);
    expect(preview.stamped).toBe(0);
    expect(preview.orgs[0].kinds).toContain("transition_14");
    expect(harness.probe.sends).toBe(0);
    expect(harness.probe.claims).toEqual([]);
    expect(harness.probe.stamps).toEqual([]);
    expect(JSON.stringify(preview)).not.toContain("@");
  });

  it("keeps the vault function unexposed and its return free of the secret", () => {
    const sql = readFileSync("supabase/migrations/0022_billing_reminders_cron.sql", "utf8");
    const rollback = readFileSync("supabase/rollback/0022_billing_reminders_cron.sql", "utf8");
    expect(sql).toMatch(/create schema if not exists private/);
    expect(sql).toMatch(/create or replace function private\.dispatch_billing_reminders\(p_dry_run boolean default false\)/);
    expect(sql).toMatch(/security definer\s+set search_path = ''/);
    expect(sql).toMatch(/revoke all on schema private from public/);
    expect(sql).toMatch(/revoke all on schema private from anon, authenticated, service_role/);
    expect(sql).toMatch(/revoke all on function private\.dispatch_billing_reminders\(boolean\) from public/);
    expect(sql).toMatch(/revoke all on function private\.dispatch_billing_reminders\(boolean\) from anon, authenticated, service_role/);
    expect(sql).toMatch(/revoke all on function private\.billing_reminders_auth_check\(bigint\) from anon, authenticated, service_role/);
    expect(sql).toMatch(/grant execute on function private\.dispatch_billing_reminders\(boolean\) to postgres/);
    expect(sql).toMatch(/grant execute on function private\.billing_reminders_auth_check\(bigint\) to postgres/);
    expect(sql).not.toMatch(/grant execute on function[\s\S]*to (anon|authenticated|service_role)/);
    expect(sql).not.toMatch(/create or replace function public\.dispatch_billing_reminders/);
    expect(sql).toMatch(/select private\.dispatch_billing_reminders\(false\)/);
    expect(sql).toMatch(/pekko-billing-reminders/);
    expect(sql).toMatch(/0 15 \* \* \*/);
    expect(sql).toMatch(/BILLING_REMINDERS/);
    expect(sql).toMatch(
      /return pg_catalog\.jsonb_build_object\(\s*'status', 'dispatched',\s*'request_id', request_id,\s*'dry_run', coalesce\(p_dry_run, false::boolean\)\s*\)/,
    );
    expect(sql).toMatch(/return pg_catalog\.jsonb_build_object\('status', 'dispatch_failed'\)/);
    expect(sql).toMatch(/return pg_catalog\.jsonb_build_object\('status', 'check_failed'\)/);
    expect(sql).toMatch(/when code = 200 and cron_auth = 'accepted' and enabled_val = 'false'::jsonb then 'aligned'/);
    const checked = sql.slice(sql.indexOf("'status', 'checked'"), sql.indexOf("'status', 'check_failed'"));
    expect(checked).not.toMatch(/content|headers|error_msg|secret|authorization/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.accounts\b/i);
    expect(sql).not.toMatch(/billing_transition_started_at/);
    expect(sql).not.toMatch(/raise\s+(log|notice|warning|exception)/i);
    expect(sql).not.toMatch(/select private\.dispatch_billing_reminders\([^)]*secret/);
    expect(rollback).toMatch(/cron\.unschedule\('pekko-billing-reminders'\)/);
    expect(rollback).toMatch(/drop function if exists private\.dispatch_billing_reminders\(boolean\)/);
    expect(rollback).toMatch(/drop function if exists public\.dispatch_billing_reminders\(\)/);
    expect(rollback).not.toMatch(/pekko-alert-delivery|vault\.update_secret|vault\.create_secret/);
    const route = readFileSync("app/api/cron/billing-reminders/route.ts", "utf8");
    expect(route).toMatch(/cronAuth: "accepted"/);
    expect(route).not.toMatch(/console\.(log|info|warn|error)\([^)]*authorization/i);
  });
});
