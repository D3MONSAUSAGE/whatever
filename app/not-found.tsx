import { PublicPage } from "@/components/public-page";
import { LogoMark } from "@/components/brand";
import { NotFoundActions } from "@/components/not-found-actions";
import { getT } from "@/lib/i18n/server";

/** I18N-1F: the 404 sits in the public shell, so it has the site nav and language selector. */
export default async function NotFound() {
  const t = await getT();
  return (
    <PublicPage>
      <div className="text-center py-10" data-testid="not-found">
        <LogoMark className="size-14 mx-auto" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{t("error.notFoundTitle")}</h1>
        <p className="mt-2 text-muted leading-relaxed">{t("error.notFoundBody")}</p>
        <NotFoundActions />
      </div>
    </PublicPage>
  );
}
