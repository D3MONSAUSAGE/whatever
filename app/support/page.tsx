import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { ContactBlock } from "@/components/contact-block";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/index";
import { rich } from "@/components/i18n/rich";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("support.metaTitle") };
}

const ITEMS: { id: string; href?: string }[] = [
  { id: "code" }, { id: "address" }, { id: "old" }, { id: "paused" }, { id: "offline" }, { id: "video" },
  { id: "password", href: "/forgot-password" },
  { id: "delete", href: "/account-deletion" },
];

export default async function Support() {
  const t = await getT();
  return (
    <PublicPage>
      <h1 className="text-2xl font-semibold tracking-tight">{t("support.title")}</h1>
      <p className="text-muted mt-1">{t("support.lede")}</p>
      <div className="mt-6 grid gap-3">
        {ITEMS.map((f) => (
          <details key={f.id} className="card p-4">
            <summary className="font-semibold cursor-pointer">{t(`support.${f.id}.q` as MessageKey)}</summary>
            <p className="mt-2 text-sm leading-relaxed">
              {rich(t(`support.${f.id}.a` as MessageKey), { link: (c) => <Link className="underline" href={f.href ?? "/support"}>{c}</Link> })}
            </p>
          </details>
        ))}
      </div>
      <ContactBlock />
    </PublicPage>
  );
}
