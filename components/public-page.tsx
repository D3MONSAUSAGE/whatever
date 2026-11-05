import { SiteNav } from "@/components/site/site-nav";
import { SiteFooter } from "@/components/site/site-footer";

/** Shared shell for every public page: site nav, content, site footer. `bare` lets full-width marketing sections handle their own layout. */
export function PublicPage({ children, wide, bare }: { children: React.ReactNode; wide?: boolean; bare?: boolean }) {
  return (
    <div className="min-h-dvh flex flex-col bg-paper">
      <SiteNav />
      <main id="main" className="flex-1">
        {bare ? children : <div className={`mx-auto px-5 py-10 ${wide ? "max-w-4xl" : "max-w-2xl"}`}>{children}</div>}
      </main>
      <SiteFooter />
    </div>
  );
}
