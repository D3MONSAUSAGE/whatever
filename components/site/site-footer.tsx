import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/brand";
import { LEGAL_COPYRIGHT } from "@/lib/legal";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/index";
import { LanguageSelect } from "@/components/i18n/language-select";

const COLS: { title: MessageKey; links: [MessageKey, string][] }[] = [
  { title: "footer.product", links: [["nav.features", "/features"], ["nav.pricing", "/pricing"], ["nav.faq", "/faq"], ["footer.startTrial", "/signup"], ["nav.login", "/login"]] },
  { title: "footer.help", links: [["common.support", "/support"], ["footer.contact", "/contact"]] },
  { title: "footer.legal", links: [["footer.terms", "/terms"], ["footer.privacy", "/privacy"], ["footer.billingTerms", "/terms#billing"], ["footer.deleteAccount", "/account-deletion"]] },
];

export async function SiteFooter({ tone = "light" }: { tone?: "light" | "dark" } = {}) {
  const t = await getT();
  const owner = LEGAL_COPYRIGHT;
  return (
    <footer className={tone === "dark" ? "border-t border-white/10 bg-[#030712]/60" : "border-t border-line bg-white/60"} data-testid="site-footer">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label={t("brand.homeLabel")}><LogoMark className="size-8" /><Wordmark size="sm" /></Link>
          <p className="mt-3 text-sm text-muted">{t("brand.footerTagline")}</p>
          <LanguageSelect className="mt-4" />
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={t(c.title)}>
            <h2 className="text-sm font-semibold">{t(c.title)}</h2>
            <ul className="mt-3 grid gap-2 text-sm text-muted">
              {c.links.map(([label, href]) => <li key={href}><Link href={href} className="hover:underline">{t(label)}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <p className="mx-auto max-w-6xl px-5 pb-8 text-xs text-muted">{t("footer.rights", { year: new Date().getFullYear(), owner })}</p>
    </footer>
  );
}
