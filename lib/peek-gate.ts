/**
 * Peek redesign preview gate (pure, no React): shared by next.config.ts, the client hook in lib/peek-flag.ts and tests.
 *
 * Two gates, both required:
 *  1. Build gate: `PEEK_WEB_ALLOWED` is inlined by next.config.ts at build time. It is "1" only when the build is
 *     NOT a Vercel Production build (VERCEL_ENV !== "production") and PEEK_WEB is not "off". A production build gets "0"
 *     unless the Production env var PEEK_WEB_PRODUCTION is "on" (the kill switch, see peekProductionOn).
 *  2. Opt-in: the `pekko_peek=1` cookie in this browser. Open any dashboard or sign-in URL with `?peek=1` to set it
 *     (and `?peek=0` to opt out). Without a cookie, the build default applies: off on Preview, on in Production
 *     while the kill switch is on.
 *
 * No API, database or contract changes: this is presentation only, so the Android app is unaffected.
 */
export const PEEK_COOKIE = "pekko_peek";

export function peekBuildAllowed(value: string | undefined = process.env.PEEK_WEB_ALLOWED): boolean {
  return value === "1";
}

/**
 * Production kill switch (t425u): Peek is on in a Production build only when the Production env var
 * `PEEK_WEB_PRODUCTION` is exactly "on" at build time. Any other value (or unset) builds the current UI.
 * To turn Peek off: set PEEK_WEB_PRODUCTION=off and redeploy, or promote the previous Peek-off deployment.
 */
export function peekProductionOn(env: Record<string, string | undefined>): boolean {
  return (env.PEEK_WEB_PRODUCTION ?? "").trim().toLowerCase() === "on";
}

/** Build-time value for next.config.ts: may this build render Peek at all? */
export function peekAllowedForBuild(env: Record<string, string | undefined>): "1" | "0" {
  if (env.VERCEL_ENV === "production") return peekProductionOn(env) ? "1" : "0";
  const raw = (env.PEEK_WEB ?? "").trim().toLowerCase();
  if (raw === "off" || raw === "0" || raw === "false") return "0";
  return "1";
}

/** Build-time value for next.config.ts: is Peek on by default (opt-out with ?peek=0)? Only Production with the switch on. */
export function peekDefaultForBuild(env: Record<string, string | undefined>): "1" | "0" {
  return env.VERCEL_ENV === "production" && peekProductionOn(env) ? "1" : "0";
}

export function peekDefaultOn(value: string | undefined = process.env.PEEK_WEB_DEFAULT): boolean {
  return value === "1";
}

/** Reads the choice from a cookie header string and an optional ?peek= value (query wins, then cookie, then default). */
export function peekOptedIn(cookie: string, query: string | null, defaultOn = false): boolean {
  if (query === "1") return true;
  if (query === "0") return false;
  const parts = cookie.split(";").map((part) => part.trim());
  if (parts.includes(`${PEEK_COOKIE}=1`)) return true;
  if (parts.includes(`${PEEK_COOKIE}=0`)) return false;
  return defaultOn;
}

/** Internal Staff pages keep the current shell even with the preview on (out of scope for the redesign). */
export function peekExcludedPath(path: string): boolean {
  const p = path.split("?")[0];
  return p === "/dashboard/staff" || p.startsWith("/dashboard/staff/");
}

/**
 * Dark mode (build step 10), opt-in while it is in QA: inside the Peek preview only, `?theme=dark`, `?theme=system`
 * (follow the device) or `?theme=light` sets the `pekko_peek_theme` cookie. With no choice the Peek UI stays light,
 * because the boards were drawn in light mode and dark needs Francisco's QA pass before it becomes the default.
 */
export const PEEK_THEME_COOKIE = "pekko_peek_theme";
export type PeekThemeChoice = "light" | "dark" | "system";

export function peekThemeChoice(cookie: string, query: string | null): PeekThemeChoice {
  const pick = (v: string | null | undefined): PeekThemeChoice | null => (v === "dark" || v === "light" || v === "system" ? v : null);
  const fromQuery = pick(query);
  if (fromQuery) return fromQuery;
  const part = cookie.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${PEEK_THEME_COOKIE}=`));
  return pick(part?.slice(PEEK_THEME_COOKIE.length + 1)) ?? "light";
}

/** The data-theme value to put on <body>. `systemDark` is the device's prefers-color-scheme answer. */
export function peekResolvedTheme(choice: PeekThemeChoice, systemDark: boolean): "light" | "dark" {
  return choice === "system" ? (systemDark ? "dark" : "light") : choice;
}
