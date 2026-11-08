import { billingNoticeKey, billingNotices, billingTemplate, type BillingNotice } from "./billing-notices";
import {
  loadEntitlement, transitionEndsAt, type EntitlementRow, type PlanId,
} from "./entitlements";
import { db } from "./supabase";
import { emailProvider } from "./email";
import { supabaseNoticeLedger, type NoticeClaim } from "./transactional-email";

/** Exactly "1" sends reminders. Anything else, including unset, changes nothing. */
export function remindersEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.BILLING_REMINDERS === "1";
}

/** Stay inside Resend's free 100 emails/day, with room for screen alerts. */
export const REMINDER_ORG_LIMIT = 40;

export type ReminderAccount = {
  id: string;
  email: string | null;
  plan: PlanId;
  state: EntitlementRow["state"];
  trial_started_at: string | null;
  trial_ends_at: string | null;
  playback_ends_at: string | null;
  grace_ends_at: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  transition_started_at: string | null;
};

export type PlannedReminder = BillingNotice & {
  claimKey: string;
  /** Set only for the first existing-customer notice, and only after that send succeeds. */
  transitionStart: string | null;
};

export type OrgDispatchResult = {
  accountId: string;
  status: "ok" | "error" | "skipped";
  error: string | null;
  kinds: string[];
};

export type DispatchResult = {
  enabled: boolean;
  dryRun: boolean;
  considered: number;
  sent: number;
  failed: number;
  skipped: number;
  stamped: number;
  orgs: OrgDispatchResult[];
};

const EMPTY: DispatchResult = {
  enabled: false, dryRun: false, considered: 0, sent: 0, failed: 0, skipped: 0, stamped: 0, orgs: [],
};

/** Stable key so a failed first try does not become a second, different notice. */
export function transitionNoticeKey(accountId: string): string {
  return `${accountId}|transition_14|notice`;
}

/**
 * Notices for one org from server timestamps. An existing customer with no stored
 * start is still due the 14-day notice. That start is not written here.
 */
export function planOrgReminders(account: ReminderAccount, now: string): PlannedReminder[] {
  const row: EntitlementRow = {
    state: account.state,
    plan: account.plan,
    screen_limit: 0,
    active_screens: 0,
    total_screens: 0,
    trial_started_at: account.trial_started_at,
    trial_ends_at: account.trial_ends_at,
    playback_ends_at: account.playback_ends_at,
    subscription_status: account.subscription_status,
    current_period_end: account.current_period_end,
    cancel_at_period_end: false,
    grace_ends_at: account.grace_ends_at,
    playback_allowed: true,
    can_add_screen: true,
    server_time: now,
  };
  const planned: PlannedReminder[] = billingNotices(row, { enforced: false }).map((notice) => ({
    ...notice,
    claimKey: billingNoticeKey(account.id, notice),
    transitionStart: null,
  }));
  if (account.plan === "grandfathered" && !account.transition_started_at) {
    const end = transitionEndsAt(now);
    if (end) {
      const notice = billingTemplate("transition_14", end);
      planned.push({ ...notice, claimKey: transitionNoticeKey(account.id), transitionStart: now });
    }
  }
  return planned;
}

export type DispatchIO = {
  now: string;
  list: () => Promise<ReminderAccount[]>;
  hasDelivered: (key: string) => Promise<boolean>;
  claim: (notice: NoticeClaim) => Promise<boolean>;
  send: (to: string, notice: BillingNotice) => Promise<{ ok: boolean; error: string | null }>;
  stamp: (accountId: string, startedAt: string) => Promise<boolean>;
};

/**
 * Disabled runs do not list orgs, send, or stamp. Dry runs list planned kinds only.
 * A failed send does not stamp the existing-customer clock and does not claim the notice.
 */
export async function runBillingDispatcher(opts: {
  enabled: boolean;
  dryRun: boolean;
  io?: DispatchIO;
}): Promise<DispatchResult> {
  if (!opts.enabled) return { ...EMPTY, dryRun: opts.dryRun };
  if (!opts.io) return { ...EMPTY, enabled: true, dryRun: opts.dryRun, orgs: [{ accountId: "", status: "error", error: "dispatcher_unconfigured", kinds: [] }] };
  const accounts = (await opts.io.list()).slice(0, REMINDER_ORG_LIMIT);
  const orgs: OrgDispatchResult[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let stamped = 0;
  for (const account of accounts) {
    try {
      const planned = planOrgReminders(account, opts.io.now);
      const kinds: string[] = [];
      if (!account.email) {
        orgs.push({ accountId: account.id, status: "skipped", error: "no_email", kinds: planned.map((item) => item.kind) });
        skipped += 1;
        continue;
      }
      let orgFailed = false;
      for (const notice of planned) {
        if (await opts.io.hasDelivered(notice.claimKey)) {
          skipped += 1;
          continue;
        }
        kinds.push(notice.kind);
        if (opts.dryRun) continue;
        const result = await opts.io.send(account.email, notice);
        if (!result.ok) {
          orgFailed = true;
          failed += 1;
          continue;
        }
        if (notice.transitionStart) {
          const wrote = await opts.io.stamp(account.id, notice.transitionStart);
          if (!wrote) {
            orgFailed = true;
            failed += 1;
            continue;
          }
          stamped += 1;
        }
        const claimed = await opts.io.claim({ id: notice.claimKey, accountId: account.id, kind: notice.kind });
        if (!claimed) {
          skipped += 1;
          continue;
        }
        sent += 1;
      }
      orgs.push({
        accountId: account.id,
        status: orgFailed ? "error" : "ok",
        error: orgFailed ? "delivery_failed" : null,
        kinds,
      });
    } catch {
      failed += 1;
      orgs.push({ accountId: account.id, status: "error", error: "org_failed", kinds: [] });
    }
  }
  return { enabled: true, dryRun: opts.dryRun, considered: accounts.length, sent, failed, skipped, stamped, orgs };
}

/** Production entry. Flag off never lists accounts, sends, or stamps. */
export async function executeBillingReminders(dryRun: boolean): Promise<DispatchResult> {
  if (!remindersEnabled()) return { ...EMPTY, dryRun };
  return runBillingDispatcher({ enabled: true, dryRun, io: liveIo(new Date().toISOString()) });
}

function liveIo(now: string): DispatchIO {
  const ledger = supabaseNoticeLedger();
  return {
    now,
    list: () => listReminderAccounts(),
    hasDelivered: (key) => ledger.has(key),
    claim: (notice) => ledger.claim(notice),
    async send(to, notice) {
      const provider = emailProvider();
      if (!provider) return { ok: false, error: "email_not_configured" };
      const result = await provider.send({ to, subject: notice.subject, text: notice.text });
      return { ok: result.ok, error: result.ok ? null : (result.error ?? "send_failed") };
    },
    async stamp(accountId, startedAt) {
      const upd = await db().from("accounts").update({ billing_transition_started_at: startedAt })
        .eq("id", accountId).eq("plan", "grandfathered").is("billing_transition_started_at", null);
      return !upd.error;
    },
  };
}

async function listReminderAccounts(): Promise<ReminderAccount[]> {
  const listed = await db().from("accounts").select("id, owner_user_id, billing_transition_started_at").order("id").limit(REMINDER_ORG_LIMIT);
  if (listed.error || !listed.data) return [];
  const out: ReminderAccount[] = [];
  for (const account of listed.data) {
    const ent = await loadEntitlement(String(account.id));
    if (ent === "error" || !ent) continue;
    const owner = await db().auth.admin.getUserById(String(account.owner_user_id));
    out.push({
      id: String(account.id),
      email: owner.data.user?.email ?? null,
      plan: ent.plan,
      state: ent.state,
      trial_started_at: ent.trial_started_at,
      trial_ends_at: ent.trial_ends_at,
      playback_ends_at: ent.playback_ends_at,
      grace_ends_at: ent.grace_ends_at,
      subscription_status: ent.subscription_status,
      current_period_end: ent.current_period_end,
      transition_started_at: account.billing_transition_started_at ? String(account.billing_transition_started_at) : null,
    });
  }
  return out;
}
