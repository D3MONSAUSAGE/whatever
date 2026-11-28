/**
 * Loads the Supabase browser client only when a page needs it. The client (and its auth library, about 60 KB
 * compressed) is not part of the public marketing pages' bundles: those pages only need it once someone is signed in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { browserSignedIn } from "@/lib/funnel-client";
import { isTrackedPath } from "@/lib/traffic";

let pending: Promise<SupabaseClient | null> | null = null;

export function loadSupabase(): Promise<SupabaseClient | null> {
  if (!pending) {
    pending = import("@/lib/supabase-browser")
      .then((m) => (m.supabaseConfigured() ? m.getSupabase() : null))
      .catch(() => { pending = null; return null; });
  }
  return pending;
}

/**
 * Whether a root-level listener needs the client on this page: always outside the marketing pages (sign-in,
 * dashboard, editor), and on marketing pages only when a session is already stored in this browser.
 */
export function needsAuthClient(pathname: string | null | undefined): boolean {
  if (!pathname || !isTrackedPath(pathname)) return true;
  return browserSignedIn();
}
