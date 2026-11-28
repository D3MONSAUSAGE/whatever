"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { loadSupabase, needsAuthClient } from "@/lib/supabase-lazy";
import { identifyUser, resetUserIdentity } from "@/lib/heycatch-events";

/**
 * Keeps HeyCatch's identity in step with the Supabase session, using only the account's opaque id. Listens to the
 * existing sign-in client; it never changes how sign-in works. Sign-out clears the identity so the next visitor on
 * this browser starts anonymous. On the public marketing pages the auth client loads only when a session exists.
 */
export function HeyCatchIdentity() {
  const needed = needsAuthClient(usePathname());
  useEffect(() => {
    if (!needed) return;
    let last: string | null = null;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void loadSupabase().then((supabase) => {
      if (!supabase || cancelled) return;
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        const id = session?.user?.id ?? null;
        if (id && id !== last) { last = id; identifyUser(id); }
        else if (!id && event === "SIGNED_OUT" && last) { last = null; resetUserIdentity(); }
      });
      stop = () => data.subscription.unsubscribe();
    });
    return () => { cancelled = true; stop?.(); };
  }, [needed]);
  return null;
}
