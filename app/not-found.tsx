import { ErrorView } from "@/components/error-view";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return <ErrorView title={t("error.notFoundTitle")} body={t("error.notFoundBody")} dashboardLabel={t("common.goToDashboard")} />;
}
