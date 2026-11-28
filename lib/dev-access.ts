"use client";
import { useEffect, useState } from "react";
import { markInternalBrowser } from "@/lib/conversion-events";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";

/**
 * Whether to show the "Developer Dashboard" link. Asks /api/developer/access (developer_users, checked on the
 * server) once per signed-in user per browser tab and remembers the answer for that tab.
 * This only hides or shows a link: the developer APIs authorize every request themselves.
 */
const KEY = "pekko_dev_access";

export function useDeveloperAccess(): boolean {
  const [developer, setDeveloper] = useState(false);
  useEffect(() => {
    if (!supabaseConfigured()) return;
    let cancelled = false;
    (async () => {
      const { data } = await getSupabase().auth.getSession();
      const session = data.session;
      if (!session) return;
      const cacheKey = `${KEY}:${session.user.id}`;
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached !== null) { if (cached === "1") markInternalBrowser(); if (!cancelled) setDeveloper(cached === "1"); return; }
      } catch { /* storage blocked: ask the server */ }
      try {
        const res = await fetch("/api/developer/access", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        const ok = res.status === 200;
        // Only cache a definite answer (200 or 404); retry later after network or server errors.
        if (res.status === 200 || res.status === 404) { try { sessionStorage.setItem(cacheKey, ok ? "1" : "0"); } catch { /* ignore */ } }
        if (ok) markInternalBrowser(); // the team's later signed-out testing on this browser isn't counted
        if (!cancelled) setDeveloper(ok);
      } catch { /* offline: keep the link hidden */ }
    })();
    return () => { cancelled = true; };
  }, []);
  return developer;
}

/** Forget the cached answer (on sign-out), so the next user in this tab is asked afresh. */
export function clearDeveloperAccess() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(`${KEY}:`)) sessionStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}
