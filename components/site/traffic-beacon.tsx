"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isTrackedPath, type TrafficBeaconBody } from "@/lib/traffic";

/**
 * Cookieless page-view beacon for the public marketing pages (see /api/traffic/collect and migration 0031).
 * Sets no cookie and stores no identifier. A per-tab sessionStorage flag (never sent) only tells the first
 * page of a visit (a "landing") from in-site navigation; only a landing carries the referrer and utm tags.
 * Nothing is sent when the browser asks not to be tracked (Global Privacy Control / Do Not Track) or when
 * someone is signed in to Pekko (customers and staff are not website visitors).
 */
const VISIT_FLAG = "pekko_tv_visit";
const SESSION_KEY = /^sb-.+-auth-token$/;
let last: { path: string; at: number } | null = null;

function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  return nav.globalPrivacyControl === true || nav.doNotTrack === "1" || nav.msDoNotTrack === "1";
}

function signedIn(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) if (SESSION_KEY.test(localStorage.key(i) ?? "")) return true;
  } catch { /* storage blocked */ }
  return false;
}

export function TrafficBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    const path = pathname ?? "";
    if (!isTrackedPath(path) || optedOut() || signedIn()) return;
    const now = Date.now();
    if (last && last.path === path && now - last.at < 2000) return; // React re-mounts in development
    last = { path, at: now };

    let landing = true;
    try {
      landing = sessionStorage.getItem(VISIT_FLAG) === null;
      sessionStorage.setItem(VISIT_FLAG, "1");
    } catch { /* storage blocked: every view counts as a landing */ }

    const body: TrafficBeaconBody = { path, landing };
    if (landing) {
      const q = new URLSearchParams(location.search);
      body.referrer = document.referrer || undefined;
      for (const k of ["utm_source", "utm_medium", "utm_campaign"] as const) {
        const v = q.get(k);
        if (v) body[k] = v.slice(0, 100);
      }
    }
    const json = JSON.stringify(body);
    try {
      const ok = navigator.sendBeacon?.("/api/traffic/collect", new Blob([json], { type: "application/json" }));
      if (!ok) void fetch("/api/traffic/collect", { method: "POST", body: json, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
    } catch { /* never affect the page */ }
  }, [pathname]);
  return null;
}
