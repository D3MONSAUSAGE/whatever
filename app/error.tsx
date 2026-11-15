"use client";
import { useEffect } from "react";
import { ErrorView } from "@/components/error-view";
import { useT } from "@/lib/i18n/client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => { console.error("Pekko page error", error.digest ?? "", error.message); }, [error]);
  return (
    <ErrorView
      title={t("error.title")}
      body={error.digest ? t("error.bodyCode", { code: error.digest }) : t("error.body")}
      dashboardLabel={t("common.goToDashboard")}
      action={<button type="button" className="btn btn-primary" onClick={reset}>{t("common.tryAgain")}</button>}
    />
  );
}
