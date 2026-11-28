"use client";
import { useEffect } from "react";
import { ErrorView } from "@/components/error-view";
import { useLocaleCode } from "@/lib/i18n/locale-context";
import { ERROR_COPY } from "@/lib/i18n/error-copy";
import { reloadOnceOnChunkErrorInBrowser } from "@/lib/chunk-reload";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const c = ERROR_COPY[useLocaleCode()] ?? ERROR_COPY.en;
  useEffect(() => {
    console.error("Pekko page error", error.digest ?? "", error.message);
    reloadOnceOnChunkErrorInBrowser(error); // R14-01: dashboard chunk skew after a deploy, once per build
  }, [error]);
  return (
    <ErrorView
      title={c.title}
      body={error.digest ? c.bodyCode.replace("{code}", error.digest) : c.body}
      dashboardLabel={c.dashboard}
      action={<button type="button" className="btn btn-primary" onClick={reset}>{c.retry}</button>}
    />
  );
}
