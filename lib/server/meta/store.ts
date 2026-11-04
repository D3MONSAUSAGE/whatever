import { db } from "@/lib/server/supabase";

export type ConsentRow = {
  visitor_id: string; user_id: string | null; status: "granted" | "withdrawn";
  fbp: string | null; fbc: string | null; fbclid: string | null;
};
export interface MetaStore {
  consentByVisitor(visitorId: string): Promise<ConsentRow | null>;
  consentByUser(userId: string): Promise<ConsentRow | null>;
  grant(row: { visitor_id: string; consent_version: string; fbp?: string | null; fbc?: string | null; fbclid?: string | null }): Promise<void>;
  touch(visitorId: string, patch: { user_id?: string; fbp?: string | null; fbc?: string | null }): Promise<void>;
  withdraw(visitorId: string): Promise<void>;
  /** Insert-first idempotency. False when (event_name, event_id) was already claimed. */
  claim(e: { event_name: string; event_id: string; action_source: string; test_mode: boolean }): Promise<boolean>;
  mark(eventName: string, eventId: string, patch: { status: string; attempts: number; last_error?: string | null }): Promise<void>;
}

const COLS = "visitor_id,user_id,status,fbp,fbc,fbclid";
const now = () => new Date().toISOString();

export const supabaseMetaStore: MetaStore = {
  async consentByVisitor(id) {
    const r = await db().from("marketing_consent").select(COLS).eq("visitor_id", id).maybeSingle();
    return (r.data as ConsentRow) ?? null;
  },
  async consentByUser(userId) {
    const r = await db().from("marketing_consent").select(COLS).eq("user_id", userId).eq("status", "granted")
      .order("last_activity_at", { ascending: false }).limit(1).maybeSingle();
    return (r.data as ConsentRow) ?? null;
  },
  async grant(row) {
    const r = await db().from("marketing_consent").upsert({ ...row, status: "granted", granted_at: now(), withdrawn_at: null, last_activity_at: now() });
    if (r.error) throw r.error;
  },
  async touch(id, patch) {
    await db().from("marketing_consent").update({ ...patch, last_activity_at: now() }).eq("visitor_id", id).eq("status", "granted");
  },
  async withdraw(id) {
    // Same statement nulls every identifier (also enforced by a CHECK constraint).
    const r = await db().from("marketing_consent").upsert({
      visitor_id: id, status: "withdrawn", consent_version: "withdrawn", withdrawn_at: now(), last_activity_at: now(), fbp: null, fbc: null, fbclid: null,
    });
    if (r.error) throw r.error;
  },
  async claim(e) {
    const r = await db().from("meta_event_log").insert(e);
    if (!r.error) return true;
    if (r.error.code === "23505") return false;
    throw r.error;
  },
  async mark(name, id, patch) {
    await db().from("meta_event_log").update({ ...patch, sent_at: patch.status === "sent" ? now() : null }).eq("event_name", name).eq("event_id", id);
  },
};
