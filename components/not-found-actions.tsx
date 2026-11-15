"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { useT } from "@/lib/i18n/client";

/**
 * I18N-1F: the 404 call to action. Signed-out visitors (the default, and what the server renders) get the
 * home page; a browser with a Pekko session also gets the dashboard.
 */
export function NotFoundActions() {
  const t = useT();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (!supabaseConfigured()) return;
    let live = true;
    getSupabase().auth.getSession().then(({ data }) => { if (live) setSignedIn(Boolean(data.session)); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2" data-testid="not-found-actions">
      {signedIn ? (
        <>
          <Link href="/dashboard" className="btn btn-primary" data-testid="not-found-dashboard">{t("common.goToDashboard")}</Link>
          <Link href="/" className="btn btn-quiet" data-testid="not-found-home">{t("error.goHome")}</Link>
        </>
      ) : (
        <>
          <Link href="/" className="btn btn-primary" data-testid="not-found-home">{t("error.goHome")}</Link>
          <Link href="/login" className="btn btn-quiet" data-testid="not-found-login">{t("nav.login")}</Link>
        </>
      )}
    </div>
  );
}
