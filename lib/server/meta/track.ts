import { metaConfig, type MetaConfig } from "./config";
import { buildEvent, postEvent, type Identifiers, type MetaEventName } from "./capi";
import { supabaseMetaStore, type ConsentRow, type MetaStore } from "./store";

export type TrackResult = "disabled" | "no_consent" | "duplicate" | "sent" | "failed";
type Deps = { cfg?: MetaConfig; store?: MetaStore; fetchImpl?: typeof fetch; delays?: number[]; log?: (msg: string) => void };

/**
 * The single CAPI gate. Order: flag -> recorded consent -> dedupe claim -> send (retry) -> log result.
 * Never throws; callers run it with next/server `after()` so the user's request never waits on Meta.
 */
export async function track(
  input: { name: MetaEventName; eventId: string; consent: ConsentRow | null; ids?: Identifiers; custom?: Record<string, unknown>; sourceUrl?: string },
  deps: Deps = {},
): Promise<TrackResult> {
  const cfg = deps.cfg ?? metaConfig();
  const store = deps.store ?? supabaseMetaStore;
  const log = deps.log ?? ((m) => console.error(m));
  if (!cfg.capiEnabled) return "disabled";
  if (input.consent?.status !== "granted") return "no_consent";
  try {
    const fresh = await store.claim({ event_name: input.name, event_id: input.eventId, action_source: buildEvent(input.name, input.eventId, {}, {}).action_source as string, test_mode: !!cfg.testEventCode });
    if (!fresh) return "duplicate";
    const ids: Identifiers = { ...input.ids, fbp: input.consent.fbp, fbc: input.consent.fbc };
    const event = buildEvent(input.name, input.eventId, ids, input.custom ?? {}, Date.now(), input.sourceUrl);
    const res = await postEvent(cfg, event, deps.fetchImpl, deps.delays);
    await store.mark(input.name, input.eventId, { status: res.ok ? "sent" : "failed", attempts: res.attempts, last_error: res.ok ? null : res.error });
    if (!res.ok) log(`[meta-capi] ${input.name} ${input.eventId} failed after ${res.attempts} tries: ${res.error}`);
    return res.ok ? "sent" : "failed";
  } catch (e) {
    log(`[meta-capi] ${input.name} ${input.eventId} error: ${e instanceof Error ? e.message : "unknown"}`);
    return "failed";
  }
}

/** Server-only. Call after the backend has committed the trial (M17 billing). One per user, ever. */
export async function trackStartTrial(user: { userId: string; email: string }, deps: Deps = {}) {
  const store = deps.store ?? supabaseMetaStore;
  const consent = await store.consentByUser(user.userId).catch(() => null);
  return track({ name: "StartTrial", eventId: `trial:${user.userId}`, consent, ids: { email: user.email }, custom: { value: 0, currency: "USD" } }, deps);
}

/**
 * Server-only. STUB until M17.3: call ONLY from the signature-verified Stripe webhook after the first paid invoice.
 * Revenue rule: Subscribe carries value; Purchase is never sent (no double count). event_id = Stripe subscription id,
 * so webhook retries collapse into one send.
 */
export async function trackSubscribe(s: { userId: string; email: string; stripeSubscriptionId: string; plan: "starter" | "business" | "multi" }, deps: Deps = {}) {
  const PRICE = { starter: 19, business: 39, multi: 59 } as const;
  const store = deps.store ?? supabaseMetaStore;
  const consent = await store.consentByUser(s.userId).catch(() => null);
  return track({ name: "Subscribe", eventId: `sub:${s.stripeSubscriptionId}`, consent, ids: { email: s.email }, custom: { value: PRICE[s.plan], currency: "USD", plan: s.plan } }, deps);
}
