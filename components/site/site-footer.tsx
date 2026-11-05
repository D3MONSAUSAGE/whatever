import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/brand";
import { LEGAL_OPERATOR_NAME } from "@/lib/legal";

const COLS = [
  { title: "Product", links: [["Features", "/features"], ["Pricing", "/pricing"], ["FAQ", "/faq"], ["Start free trial", "/signup"], ["Login", "/login"]] },
  { title: "Help", links: [["Support", "/support"], ["Contact", "/contact"]] },
  { title: "Legal", links: [["Terms", "/terms"], ["Privacy", "/privacy"], ["Delete your account", "/account-deletion"]] },
] as const;

export function SiteFooter() {
  // Copyright uses the configured operator name only; until it's set, plain "Pekko" (no entity claimed).
  const owner = LEGAL_OPERATOR_NAME ?? "Pekko";
  return (
    <footer className="border-t border-line bg-white/60" data-testid="site-footer">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Pekko home"><LogoMark className="size-8" /><Wordmark size="sm" /></Link>
          <p className="mt-3 text-sm text-muted">Simple digital signage for your business.</p>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="text-sm font-semibold">{c.title}</h2>
            <ul className="mt-3 grid gap-2 text-sm text-muted">
              {c.links.map(([label, href]) => <li key={href}><Link href={href} className="hover:underline">{label}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <p className="mx-auto max-w-6xl px-5 pb-8 text-xs text-muted">© {new Date().getFullYear()} {owner}. All rights reserved.</p>
    </footer>
  );
}
