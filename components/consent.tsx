"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type State = { enabled: boolean; gpc: boolean; consent: "granted" | "withdrawn" | "unset"; pixelId: string | null };
declare global { interface Window { fbq?: ((...a: unknown[]) => void) & { queue?: unknown[] }; _fbq?: unknown } }

/** Loads fbq ONLY after the server confirms recorded consent and returns a Pixel id. Nothing Meta loads before that. */
function loadPixel(pixelId: string) {
  if (window.fbq) return;
  const q: unknown[] = [];
  const f = ((...a: unknown[]) => { q.push(a); }) as NonNullable<Window["fbq"]>;
  f.queue = q; window.fbq = f; window._fbq = f;
  const s = document.createElement("script");
  s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
  f("init", pixelId); // no advanced matching: email never goes to the browser Pixel
}

/** Fire a paired browser+server event with one event_id. No-op without consent. */
export function metaEvent(name: "PageView" | "ViewContent" | "CompleteRegistration", custom: Record<string, unknown> = {}, token?: string) {
  if (typeof window === "undefined" || !window.fbq) return;
  const eventId = crypto.randomUUID();
  window.fbq("track", name, custom, { eventID: eventId });
  fetch("/api/meta/event", {
    method: "POST", keepalive: true,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ name, eventId, custom, sourceUrl: location.origin + location.pathname }),
  }).catch(() => {});
}

export function ConsentManager() {
  const [s, setS] = useState<State | null>(null);
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => {
    fetch("/api/consent", { cache: "no-store" }).then((r) => r.json()).then(setS).catch(() => setS(null));
    const reopen = () => setOpen(true);
    window.addEventListener("pekko:privacy-choices", reopen);
    return () => window.removeEventListener("pekko:privacy-choices", reopen);
  }, []);
  useEffect(() => { if (s?.pixelId) { loadPixel(s.pixelId); metaEvent("PageView"); } }, [s?.pixelId, path]);

  const choose = useCallback(async (choice: "grant" | "withdraw") => {
    const fbclid = new URLSearchParams(location.search).get("fbclid") ?? undefined;
    const r = await fetch("/api/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice, fbclid }) });
    const d = await r.json().catch(() => ({}));
    setOpen(false);
    if (choice === "withdraw") { setS((p) => p && { ...p, consent: "withdrawn", pixelId: null }); if (window.fbq) location.reload(); return; }
    setS((p) => p && { ...p, consent: r.ok ? "granted" : p.consent, pixelId: d.pixelId ?? null });
  }, []);

  if (!s?.enabled) return null;
  const show = open || (s.consent === "unset" && !s.gpc);
  if (!show) return null;
  return (
    <div role="dialog" aria-label="Privacy choices" data-testid="consent-banner" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-xl border bg-white p-4 shadow-lg text-sm">
      <p className="mb-3">
        {s.gpc ? "Your browser's Global Privacy Control is on, so we don't use marketing cookies. " : "We'd like to use Meta (Facebook) marketing cookies to measure our ads. They stay off unless you say yes. "}
        <a href="/privacy#marketing" className="underline">Learn more</a>
      </p>
      <div className="flex gap-2 justify-end">
        {s.consent === "granted" && <button className="btn" onClick={() => choose("withdraw")}>Turn off marketing cookies</button>}
        {s.consent !== "granted" && <button className="btn" onClick={() => choose("withdraw")}>No thanks</button>}
        {s.consent !== "granted" && !s.gpc && <button className="btn btn-primary" onClick={() => choose("grant")}>Allow</button>}
      </div>
    </div>
  );
}

/** Footer link that reopens the choice dialog (withdraw anytime). */
export function PrivacyChoicesLink({ className }: { className?: string }) {
  return <button type="button" data-testid="privacy-choices" className={className} onClick={() => window.dispatchEvent(new Event("pekko:privacy-choices"))}>Privacy choices</button>;
}
