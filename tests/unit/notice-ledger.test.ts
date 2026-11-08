import { afterEach, describe, expect, it } from "vitest";
import { selfTestClaimKey } from "@/lib/server/billing-notices";
import { setTestDb } from "@/lib/server/supabase";
import { BILLING_EMAIL_FROM, sendTransactionalEmail, supabaseNoticeLedger } from "@/lib/server/transactional-email";

const org = "65310cfc-a046-451c-8912-d73cb986747e";

type Row = { id: string; account_id: string; kind: string };

function ledgerDb() {
  const rows: Row[] = [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const client = {
    from(table: string) {
      if (table !== "billing_notices") throw new Error(`unexpected table ${table}`);
      return {
        insert(row: Row) {
          if (!uuid.test(String(row.account_id))) {
            return Promise.resolve({
              data: null,
              error: {
                code: "22P02",
                message: `invalid input syntax for type uuid: "${row.account_id}"`,
                details: "sk_live_should_not_leak",
                hint: row.account_id,
              },
            });
          }
          if (rows.some((existing) => existing.id === row.id)) {
            return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key value" } });
          }
          rows.push({ id: row.id, account_id: row.account_id, kind: row.kind });
          return Promise.resolve({ data: row, error: null });
        },
        select() {
          return {
            eq(_column: string, value: string) {
              return {
                maybeSingle() {
                  const found = rows.find((existing) => existing.id === value);
                  return Promise.resolve({ data: found ? { id: found.id } : null, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, rows };
}

afterEach(() => setTestDb(null));

describe("supabase notice ledger", () => {
  it("stores the account uuid and kind beside a selftest key, and dedupes that key", async () => {
    const db = ledgerDb();
    setTestDb(db.client as never);
    const id = selfTestClaimKey(org, "launch-1108-a", "trial_ending_3");
    const ledger = supabaseNoticeLedger();
    expect(await ledger.claim({ id, accountId: org, kind: "trial_ending_3" })).toBe(true);
    expect(db.rows).toEqual([{ id, account_id: org, kind: "trial_ending_3" }]);
    expect(db.rows[0].account_id).not.toBe(id);
    expect(await ledger.claim({ id, accountId: org, kind: "trial_ending_3" })).toBe(false);
    expect(db.rows).toHaveLength(1);

    const liveId = `${org}|payment_failed|2026-12-01T00:00:00.000Z`;
    expect(await ledger.claim({ id: liveId, accountId: org, kind: "payment_failed" })).toBe(true);
    expect(db.rows[1]).toEqual({ id: liveId, account_id: org, kind: "payment_failed" });
  });

  it("calls Resend only after a valid claim, and not again for the same key", async () => {
    const db = ledgerDb();
    setTestDb(db.client as never);
    const id = selfTestClaimKey(org, "launch-1108-a", "payment_failed");
    let calls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls += 1;
      expect(db.rows).toEqual([{ id, account_id: org, kind: "payment_failed" }]);
      return new Response(JSON.stringify({ id: "re_ok" }), { status: 200 });
    }) as typeof fetch;
    const env = { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test-key", ALERT_EMAIL_FROM: BILLING_EMAIL_FROM };
    try {
      const first = await sendTransactionalEmail({
        idempotencyKey: id, accountId: org, kind: "payment_failed",
        message: { to: "owner@example.com", subject: "[TEST] payment", text: "body" }, env,
      });
      const second = await sendTransactionalEmail({
        idempotencyKey: id, accountId: org, kind: "payment_failed",
        message: { to: "owner@example.com", subject: "[TEST] payment", text: "body" }, env,
      });
      expect(first).toMatchObject({ sent: true, reason: "sent", id: "re_ok" });
      expect(second).toMatchObject({ sent: false, reason: "duplicate", id: null });
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("does not call Resend when Postgres rejects the row, and logs only the SQLSTATE", async () => {
    const db = ledgerDb();
    setTestDb(db.client as never);
    const lines: string[] = [];
    let calls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ id: "re_should_not_send" }), { status: 200 });
    }) as typeof fetch;
    try {
      const id = selfTestClaimKey(org, "launch-1108-a", "trial_ending_3");
      const result = await sendTransactionalEmail({
        idempotencyKey: id,
        accountId: id,
        kind: "trial_ending_3",
        message: { to: "owner@example.com", subject: "[TEST] trial", text: "body" },
        env: { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test-key", ALERT_EMAIL_FROM: BILLING_EMAIL_FROM },
        log: (line) => lines.push(line),
      });
      expect(result).toEqual({
        sent: false,
        reason: "failed",
        id: null,
        error: "Couldn't record this send (22P02). No email was sent.",
      });
      expect(calls).toBe(0);
      expect(db.rows).toHaveLength(0);
      expect(lines).toEqual(["billing-email ledger error code=22P02"]);
      expect(lines.join("\n")).not.toMatch(/sk_live|test-key|invalid input/);
    } finally {
      globalThis.fetch = original;
    }
  });
});
