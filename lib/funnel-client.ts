/**
 * Browser side of the cookieless counters (page views: 0031, funnel events: 0032). No cookie, no identifier.
 * Nothing is sent when the browser asks not to be tracked (Global Privacy Control / Do Not Track) or when
 * someone is signed in to Pekko (customers and staff are not website visitors).
 */
import type { FunnelBody, FunnelEvent } from "@/lib/funnel";

const SESSION_KEY = /^sb-.+-auth-token$/;

export function browserOptedOut(): boolean {
  if (typeof navigator === "undefined") return true;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  return nav.globalPrivacyControl === true || nav.doNotTrack === "1" || nav.msDoNotTrack === "1";
}

export function browserSignedIn(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) if (SESSION_KEY.test(localStorage.key(i) ?? "")) return true;
  } catch { /* storage blocked */ }
  return false;
}

/** POSTs a small JSON body without delaying navigation (sendBeacon, with a keepalive fetch fallback). */
export function beacon(url: string, body: unknown): void {
  const json = JSON.stringify(body);
  try {
    const ok = navigator.sendBeacon?.(url, new Blob([json], { type: "application/json" }));
    if (!ok) void fetch(url, { method: "POST", body: json, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
  } catch { /* never affect the page */ }
}

const once = new Set<string>();

/** Counts one funnel event. `oncePerPage` drops repeats of the same event and detail until the next page load. */
export function trackFunnel(event: FunnelEvent, detail = "", opts: { oncePerPage?: boolean } = {}): void {
  if (typeof window === "undefined" || browserOptedOut() || browserSignedIn()) return;
  if (opts.oncePerPage) {
    const k = `${event}:${detail}`;
    if (once.has(k)) return;
    once.add(k);
  }
  const body: FunnelBody = detail ? { event, detail } : { event };
  beacon("/api/traffic/event", body);
}
