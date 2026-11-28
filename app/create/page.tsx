import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { guestEditorEnabled } from "@/lib/guest-editor-flag";
import { getLocale, getT } from "@/lib/i18n/server";
import { localizedPath } from "@/lib/seo";
import { GuestCreate } from "@/components/guest/guest-create";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("guest.metaTitle"), robots: { index: false, follow: false } };
}

/**
 * /create: build a menu in the real editor before creating an account (GUEST_EDITOR=on). 404 while the flag is off.
 * `?design=<id>` starts from a design, `?from=demo` opens the menu the homepage demo just handed over.
 */
export default async function CreatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!guestEditorEnabled()) notFound();
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 60) : null);
  const t = await getT();
  const locale = await getLocale();
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-paper/95 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto max-w-[1400px] px-4 h-14 flex items-center gap-3">
          <Link href={localizedPath("/", locale)} aria-label={t("brand.homeLabel")}><img src="/peek/brand/pekko-lockup-light.svg" alt="Pekko" width={114} height={30} /></Link>
          <span className="flex-1" />
          <Link href={`/login?next=${encodeURIComponent("/dashboard/claim")}`} className="text-sm font-semibold underline underline-offset-4" data-testid="guest-login-link">{t("nav.login")}</Link>
        </div>
      </header>
      <main id="main">
        <GuestCreate design={one(q.design)} from={one(q.from)} />
      </main>
    </div>
  );
}
