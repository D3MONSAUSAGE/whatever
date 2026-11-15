import { makeT } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/locales";

/** R14-01: the last-resort error page body, in the given language. */
export function GlobalErrorView({ locale, digest, reset }: { locale: Locale; digest?: string; reset: () => void }) {
  const t = makeT(locale);
  return (
    <html lang={locale}>
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, background: "#f5f8ff", color: "#0b1530" }}>
        <main style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 22 }}>{t("globalError.title")}</h1>
          <p style={{ color: "#5b6785" }}>{t("globalError.body")}{digest ? t("globalError.code", { code: digest }) : ""}</p>
          <button type="button" onClick={reset} style={{ background: "#0066FF", color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontSize: 15 }}>{t("common.tryAgain")}</button>
        </main>
      </body>
    </html>
  );
}
