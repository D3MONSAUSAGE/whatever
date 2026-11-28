"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { browserSignedIn } from "@/lib/funnel-client";
import { loadSupabase } from "@/lib/supabase-lazy";

/**
 * I18N-1F: the 404 call to action. Signed-out visitors (the default, and what the server renders) get the
 * home page; a browser with a Pekko session also gets the dashboard.
 */
export type NotFoundLabels = { dashboard: string; home: string; login: string };

/** Labels come from the server page (no dictionaries in the browser); the auth client loads only if a session is stored. */
export function NotFoundActions({ labels }: { labels: NotFoundLabels }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (!browserSignedIn()) return;
    let live = true;
    void loadSupabase().then((supabase) => supabase?.auth.getSession()).then((res) => { if (live && res) setSignedIn(Boolean(res.data.session)); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2" data-testid="not-found-actions">
      {signedIn ? (
        <>
          <Link href="/dashboard" className="btn btn-primary" data-testid="not-found-dashboard">{labels.dashboard}</Link>
          <Link href="/" className="btn btn-quiet" data-testid="not-found-home">{labels.home}</Link>
        </>
      ) : (
        <>
          <Link href="/" className="btn btn-primary" data-testid="not-found-home">{labels.home}</Link>
          <Link href="/login" className="btn btn-quiet" data-testid="not-found-login">{labels.login}</Link>
        </>
      )}
    </div>
  );
}
