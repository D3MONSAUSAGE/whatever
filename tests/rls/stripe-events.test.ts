import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { removeCreatedTestUsers } from "../helpers/account-cleanup";
import { setTestDb } from "@/lib/server/supabase";
import { applyEvent } from "@/lib/server/stripe";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url) && service.length > 20;

describe.skipIf(!local)("stripe webhook events (local database)", () => {
  let db: SupabaseClient;
  const users: string[] = [];
  beforeAll(() => { db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }); setTestDb(db); process.env.STRIPE_PRICE_BUSINESS = "price_biz_test"; });
  afterAll(async () => { setTestDb(null); await removeCreatedTestUsers(db, users); });

  it("applies a subscription once and ignores replays", async () => {
    const { data: u } = await db.auth.admin.createUser({ email: `pantalla-rls-${randomUUID()}@mailinator.com`, password: `${randomUUID()}Aa1!`, email_confirm: true });
    users.push(u.user!.id);
    const { data: acct } = await db.rpc("ensure_account", { p_user_id: u.user!.id, p_name: "Shop" });
    const ev = { id: `evt_${randomUUID()}`, type: "customer.subscription.created", livemode: false,
      data: { object: { id: `sub_${randomUUID()}`, customer: `cus_${randomUUID()}`, status: "active", cancel_at_period_end: false,
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400, metadata: { account_id: acct },
        items: { data: [{ price: { id: "price_biz_test" } }] } } } } as unknown as Stripe.Event;
    expect(await applyEvent(ev)).toBe(true);
    expect(await applyEvent(ev)).toBe(false);
    const { data: e } = await db.rpc("account_entitlement", { p_account: acct });
    expect(e[0]).toMatchObject({ state: "active", plan: "business", screen_limit: 3 });
  });
});
