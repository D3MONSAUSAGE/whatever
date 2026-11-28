import { SiteNav, SITE_NAV_KEYS } from "@/components/site/site-nav";
import { getT } from "@/lib/i18n/server";
import { SiteFooter } from "@/components/site/site-footer";
import { TrafficBeacon } from "@/components/site/traffic-beacon";
import "@/components/site/marketing/marketing.css";
import { preload } from "react-dom";

/**
 * Shared shell for every public page: site nav, content, site footer. `bare` lets full-width marketing sections handle their own layout.
 * `theme="dark"` is the marketing look (home, features, pricing, FAQ, support, contact). Its styles are scoped under `.mk`,
 * so pages that keep the default (legal, 404, developer) render exactly as before.
 */
export async function PublicPage({ children, wide, bare, theme }: { children: React.ReactNode; wide?: boolean; bare?: boolean; theme?: "dark" }) {
  const dark = theme === "dark";
  const t = await getT();
  const labels = Object.fromEntries(SITE_NAV_KEYS.map((k) => [k, t(k)]));
  // Performance: the headline face is the largest text on first paint, so fetch it with the HTML.
  if (dark) preload("/marketing/fonts/Montserrat-ExtraBold.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <div className={dark ? "mk min-h-dvh flex flex-col" : "min-h-dvh flex flex-col bg-paper"}>
      {dark ? <SiteNav tone="dark" labels={labels} /> : <SiteNav labels={labels} />}
      {/* Cookieless page-view counter: marketing pages only (the beacon and the server both check the path). */}
      {dark ? <TrafficBeacon /> : null}
      <main id="main" className="flex-1">
        {bare ? children : <div className={`mx-auto px-5 py-10 ${wide ? "max-w-4xl" : "max-w-2xl"} ${dark ? "md:py-16" : ""}`}>{children}</div>}
      </main>
      <SiteFooter tone={dark ? "dark" : "light"} />
    </div>
  );
}
