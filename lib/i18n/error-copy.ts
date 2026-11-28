import type { Locale } from "./locales";

/**
 * The root error page's text, kept out of the full dictionaries so every page doesn't ship both message tables
 * just for its error boundary. tests/unit/i18n-split.test.ts checks these match en.ts / es.ts exactly.
 */
export const ERROR_COPY: Record<Locale, { title: string; body: string; bodyCode: string; dashboard: string; retry: string }> = {
  en: {
    title: "Something went wrong",
    body: "This page hit a problem. Your screens keep playing. Try again, and if it keeps happening, tell support.",
    bodyCode: "This page hit a problem. Your screens keep playing. Try again, and if it keeps happening, tell support the code {code}.",
    dashboard: "Go to dashboard",
    retry: "Try again",
  },
  es: {
    title: "Algo salió mal",
    body: "Esta página tuvo un problema. Sus pantallas siguen funcionando. Intente de nuevo y, si el problema continúa, avise a soporte.",
    bodyCode: "Esta página tuvo un problema. Sus pantallas siguen funcionando. Intente de nuevo y, si el problema continúa, indique a soporte el código {code}.",
    dashboard: "Ir al panel",
    retry: "Intentar de nuevo",
  },
};
