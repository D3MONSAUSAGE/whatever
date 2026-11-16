import { SiteNav } from "@/components/site/site-nav";
import { SiteFooter } from "@/components/site/site-footer";
import "@/components/site/marketing/marketing.css";

/**
 * Shared shell for every public page: site nav, content, site footer. `bare` lets full-width marketing sections handle their own layout.
 * `theme="dark"` is the marketing look (home, features, pricing, FAQ, support, contact). Its styles are scoped under `.mk`,
 * so pages that keep the default (legal, 404, developer) render exactly as before.
 */
export function PublicPage({ children, wide, bare, theme }: { children: React.ReactNode; wide?: boolean; bare?: boolean; theme?: "dark" }) {
  const dark = theme === "dark";
  return (
    <div className={dark ? "mk min-h-dvh flex flex-col" : "min-h-dvh flex flex-col bg-paper"}>
      {dark ? <SiteNav tone="dark" /> : <SiteNav />}
      <main id="main" className="flex-1">
        {bare ? children : <div className={`mx-auto px-5 py-10 ${wide ? "max-w-4xl" : "max-w-2xl"} ${dark ? "md:py-16" : ""}`}>{children}</div>}
      </main>
      <SiteFooter tone={dark ? "dark" : "light"} />
    </div>
  );
}
