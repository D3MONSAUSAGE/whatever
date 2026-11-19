"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isTrackedPath, type TrafficBeaconBody } from "@/lib/traffic";
import { beacon, browserOptedOut, browserSignedIn } from "@/lib/funnel-client";

/**
 * Cookieless page-view beacon for the public marketing pages (see /api/traffic/collect and migration 0031).
 * Sets no cookie and stores no identifier. A per-tab sessionStorage flag (never sent) only tells the first
 * page of a visit (a "landing") from in-site navigation; only a landing carries the referrer and utm tags.
 * Nothing is sent when the browser asks not to be tracked (Global Privacy Control / Do Not Track) or when
 * someone is signed in to Pekko (customers and staff are not website visitors).
 */
const VISIT_FLAG = "pekko_tv_visit";
let last: { path: string; at: number } | null = null;

export function TrafficBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    const path = pathname ?? "";
    if (!isTrackedPath(path) || browserOptedOut() || browserSignedIn()) return;
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
    beacon("/api/traffic/collect", body);
  }, [pathname]);
  return null;
}
