/**
 * Which public marketing site to serve (home, /features, /pricing, /faq).
 *  - "peek": the Peek marketing site (components/site/peek), approved November 2026.
 *  - "b": the Option B home (components/site/marketing/home-b.tsx) and the current dark standalone pages.
 *  - "classic": the previous home page (components/site/marketing/home-classic.tsx), the older rollback.
 *
 * HOME_VARIANT=peek|b|classic always wins. Without it:
 *  - Vercel Production: "peek" only while Pantalla's Peek kill switch PEEK_WEB_PRODUCTION is exactly "on", so the
 *    public site and the web app switch to the Peek identity together; otherwise "b" (today's site, unchanged).
 *  - Preview and local builds: "peek", unless PEEK_WEB is off/0/false (same opt-out as the web app preview).
 * Read at request time on the server, so a redeploy with a changed env var is enough to switch; no code change.
 */
export type HomeVariant = "peek" | "b" | "classic";

const VARIANTS: readonly HomeVariant[] = ["peek", "b", "classic"];

export function homeVariant(env: Record<string, string | undefined> = process.env): HomeVariant {
  const raw = (env.HOME_VARIANT ?? "").trim().toLowerCase();
  if ((VARIANTS as readonly string[]).includes(raw)) return raw as HomeVariant;
  return peekMarketingDefault(env) ? "peek" : "b";
}

/** True when the standalone marketing pages (/features, /pricing, /faq) should render in Peek. */
export function marketingPeek(env: Record<string, string | undefined> = process.env): boolean {
  return homeVariant(env) === "peek";
}

function peekMarketingDefault(env: Record<string, string | undefined>): boolean {
  if (env.VERCEL_ENV === "production") return (env.PEEK_WEB_PRODUCTION ?? "").trim().toLowerCase() === "on";
  const off = (env.PEEK_WEB ?? "").trim().toLowerCase();
  return !(off === "off" || off === "0" || off === "false");
}
