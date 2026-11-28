"use client";
import { useEffect } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { identifyUser, resetUserIdentity } from "@/lib/heycatch-events";

/**
 * Keeps HeyCatch's identity in step with the Supabase session, using only the account's opaque id. Listens to the
 * existing sign-in client; it never changes how sign-in works. Sign-out clears the identity so the next visitor on
 * this browser starts anonymous.
 */
export function HeyCatchIdentity() {
  useEffect(() => {
    if (!supabaseConfigured()) return;
    let last: string | null = null;
    const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
      const id = session?.user?.id ?? null;
      if (id && id !== last) { last = id; identifyUser(id); }
      else if (!id && event === "SIGNED_OUT" && last) { last = null; resetUserIdentity(); }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return null;
}
