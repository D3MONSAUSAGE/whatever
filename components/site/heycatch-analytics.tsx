"use client";
import { useEffect } from "react";
import { analytics } from "@heycatch/sdk";
import { browserOptedOut, browserSignedIn } from "@/lib/funnel-client";
import { HEYCATCH_PROJECT_KEY, heycatchBeforeSend } from "@/lib/heycatch";

/**
 * HeyCatch website analytics for the public marketing pages only. Rendered by the six marketing page files (home, features,
 * pricing, FAQ, support, contact; English and /es are the same routes), never by a shared shell, the dashboard, developer
 * console, sign-in, legal pages or the TV player.
 *
 * Consent parity with the existing cookieless counter: pekkotv.com has no consent banner, so the rule is the counter's
 * rule. Nothing starts when the browser sends Global Privacy Control / Do Not Track, or when someone is signed in to Pekko
 * (customers and staff are not website visitors).
 *
 * Why `init` is called from this component and not at module scope (the guide's default): Next evaluates a page's client
 * modules whenever that page's chunk loads, and the shared site nav lives in the home page's chunk, so a module-scope `init`
 * would also start HeyCatch on /login and the 404 page. `init` is idempotent, the component is on every marketing page, and the
 * SDK import is still static, so no event is lost. Autocapture covers pageviews, clicks (including "Create my free menu") and
 * client-side route changes, so there are no hand-written listeners. After a soft navigation out of the marketing pages the SDK
 * stays loaded in that document, so `beforeSend` drops every event captured while the URL is not a marketing page (and a
 * return to a marketing page records its pageview normally).
 */
export function HeyCatchAnalytics() {
  useEffect(() => {
    if (browserOptedOut() || browserSignedIn()) return;
    analytics.init({
      projectKey: HEYCATCH_PROJECT_KEY,
      site: "landing",
      install: { framework: "nextjs", frameworkVersion: "15", agent: "other" },
      beforeSend: (event) => heycatchBeforeSend(event),
    });
  }, []);
  return null;
}
