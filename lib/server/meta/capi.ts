import { createHash } from "node:crypto";
import type { MetaConfig } from "./config";

export type ActionSource = "website" | "system_generated";
/** Event -> fixed action_source. Browser-paired events are "website"; backend-only facts are "system_generated". */
export const EVENTS = {
  PageView: "website",
  ViewContent: "website",
  CompleteRegistration: "website",
  StartTrial: "system_generated",
  ActivatedTrial: "system_generated",
  Subscribe: "system_generated",
} as const satisfies Record<string, ActionSource>;
export type MetaEventName = keyof typeof EVENTS;
/** Events a browser may ask the server to send. StartTrial/ActivatedTrial/Subscribe are server-only. */
export const BROWSER_EVENTS: MetaEventName[] = ["PageView", "ViewContent", "CompleteRegistration"];

export const sha256 = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

export type Identifiers = { email?: string | null; ip?: string | null; ua?: string | null; fbp?: string | null; fbc?: string | null };

/** Allowlisted custom_data only. Screen names, media, menus and any customer content are never sent. */
const ALLOWED_CUSTOM: Record<string, (v: unknown) => boolean> = {
  content_name: (v) => v === "landing" || v === "pricing",
  status: (v) => v === "verified",
  value: (v) => typeof v === "number" && v >= 0 && v < 1000,
  currency: (v) => v === "USD",
  plan: (v) => v === "starter" || v === "business" || v === "multi",
  screens_paired: (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 5,
};
export function cleanCustomData(input: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (ALLOWED_CUSTOM[k]?.(v)) out[k] = v;
  return out;
}

export function buildEvent(name: MetaEventName, eventId: string, ids: Identifiers, custom: Record<string, unknown>, nowMs = Date.now(), sourceUrl?: string) {
  const user_data: Record<string, unknown> = {};
  if (ids.email) user_data.em = [sha256(ids.email)];
  if (ids.ip && ids.ip !== "unknown") user_data.client_ip_address = ids.ip;
  if (ids.ua) user_data.client_user_agent = ids.ua.slice(0, 500);
  if (ids.fbp) user_data.fbp = ids.fbp;
  if (ids.fbc) user_data.fbc = ids.fbc;
  const ev: Record<string, unknown> = {
    event_name: name,
    event_id: eventId,
    event_time: Math.floor(nowMs / 1000),
    action_source: EVENTS[name],
    user_data,
    custom_data: cleanCustomData(custom),
  };
  if (EVENTS[name] === "website" && sourceUrl) ev.event_source_url = sourceUrl.split("?")[0]; // drop query (fbclid etc.)
  return ev;
}

/** POSTs one event with retry (3 tries, backoff). Never throws. Token goes in the body, never in logs. */
export async function postEvent(cfg: MetaConfig, event: Record<string, unknown>, fetchImpl: typeof fetch = fetch, delays = [500, 2000]) {
  const body: Record<string, unknown> = { data: [event], access_token: cfg.token };
  if (cfg.testEventCode) body.test_event_code = cfg.testEventCode;
  let lastError = "";
  for (let attempt = 1; attempt <= delays.length + 1; attempt++) {
    try {
      const res = await fetchImpl(`${cfg.endpoint}/${cfg.datasetId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return { ok: true as const, attempts: attempt };
      lastError = `HTTP ${res.status}`;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break; // not retryable
    } catch (e) {
      lastError = e instanceof Error ? e.name : "network error";
    }
    if (attempt <= delays.length) await new Promise((r) => setTimeout(r, delays[attempt - 1]));
  }
  return { ok: false as const, attempts: delays.length + 1, error: lastError };
}
