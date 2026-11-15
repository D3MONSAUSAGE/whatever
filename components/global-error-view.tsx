import type { Locale } from "@/lib/i18n/locales";

// Inlined on purpose (Gother LOW): the last-resort page must not pull in the full EN/ES dictionaries,
// because it is exactly the page shown when chunks fail to load. English is byte-identical to before.
const COPY: Record<Locale, { title: string; body: string; code: string; tryAgain: string }> = {
  en: { title: "Pekko is having trouble", body: "Your screens keep playing. Try again in a moment.", code: " Code: ", tryAgain: "Try again" },
  es: { title: "Pekko tiene problemas", body: "Sus pantallas siguen funcionando. Intente de nuevo en un momento.", code: " Código: ", tryAgain: "Intentar de nuevo" },
};

/** R14-01: the last-resort error page body, in the given language. */
export function GlobalErrorView({ locale, digest, reset }: { locale: Locale; digest?: string; reset: () => void }) {
  const c = COPY[locale] ?? COPY.en;
  return (
    <html lang={locale}>
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, background: "#f5f8ff", color: "#0b1530" }}>
        <main style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 22 }}>{c.title}</h1>
          <p style={{ color: "#5b6785" }}>{c.body}{digest ? c.code + digest : ""}</p>
          <button type="button" onClick={reset} style={{ background: "#0066FF", color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontSize: 15 }}>{c.tryAgain}</button>
        </main>
      </body>
    </html>
  );
}
