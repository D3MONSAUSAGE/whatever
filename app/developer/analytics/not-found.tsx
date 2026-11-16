import { PublicPage } from "@/components/public-page";
import { LogoMark } from "@/components/brand";
import { NotFoundActions } from "@/components/not-found-actions";
import { getT } from "@/lib/i18n/server";
import { DeveloperAnalytics } from "./client";

/** Same markup as app/not-found.tsx. Developers see the console once the API confirms them; everyone else sees this. */
export default async function DeveloperAnalyticsNotFound() {
  const t = await getT();
  const notFound = (
    <PublicPage>
      <div className="text-center py-10" data-testid="not-found">
        <LogoMark className="size-14 mx-auto" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{t("error.notFoundTitle")}</h1>
        <p className="mt-2 text-muted leading-relaxed">{t("error.notFoundBody")}</p>
        <NotFoundActions />
      </div>
    </PublicPage>
  );
  return <DeveloperAnalytics notFound={notFound} />;
}
