"use client";
import { useEffect, useState } from "react";
import { LoadState } from "@/components/ui";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";

/**
 * Customer Accounts moved into the developer console as its own tab (/developer/analytics?view=accounts).
 * This old URL still answers HTTP 404 to everyone (page.tsx). In the browser, a confirmed developer
 * (GET /api/developer/access, developer_users checked on the server) is sent to the new tab; everyone else
 * keeps seeing the normal "not found" page. The tab's data comes from the same gated /api/developer/accounts.
 */
export const ACCOUNTS_TAB_URL = "/developer/analytics?view=accounts";

export function DeveloperAccounts({ notFound }: { notFound: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "notFound">("checking");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabaseConfigured()) { setState("notFound"); return; }
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) { if (!cancelled) setState("notFound"); return; }
      try {
        const res = await fetch("/api/developer/access", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (cancelled) return;
        if (res.status === 200) location.replace(ACCOUNTS_TAB_URL);
        else setState("notFound");
      } catch {
        if (!cancelled) setState("notFound");
      }
    })();
    return () => { cancelled = true; };
  }, []);
  if (state === "notFound") return <>{notFound}</>;
  return <main id="main" className="mx-auto max-w-6xl px-5 py-8"><LoadState error={null} /></main>;
}
