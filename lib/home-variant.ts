/**
 * Which public marketing site to serve (home, /features, /pricing, /faq).
 *  - "peek": the Peek marketing site (components/site/peek), approved and launched November 2026.
 *  - "b": the Option B home (components/site/marketing/home-b.tsx) and the previous dark standalone pages.
 *  - "classic": the older home page (components/site/marketing/home-classic.tsx).
 *
 * Resolution, read on the server at request time:
 *  1. HOME_VARIANT=peek|b|classic always wins (Vercel env var; change it and redeploy).
 *  2. Otherwise MARKETING_DEFAULT on every Vercel environment and locally, unless PEEK_WEB is off/0/false
 *     outside Production (the same opt-out as the web app preview).
 *
 * The marketing site is independent of the web app: Pantalla's PEEK_WEB_PRODUCTION switch (dashboard, sign-in) does
 * not change it, and rolling the marketing site back never touches the dashboard.
 * Marketing rollback: set HOME_VARIANT=b in Vercel and redeploy, or change MARKETING_DEFAULT to "b" in a PR.
 */
export type HomeVariant = "peek" | "b" | "classic";

/** The marketing site served when HOME_VARIANT is not set. One-line rollback: "b". */
export const MARKETING_DEFAULT: HomeVariant = "peek";

const VARIANTS: readonly HomeVariant[] = ["peek", "b", "classic"];

export function homeVariant(env: Record<string, string | undefined> = process.env): HomeVariant {
  const raw = (env.HOME_VARIANT ?? "").trim().toLowerCase();
  if ((VARIANTS as readonly string[]).includes(raw)) return raw as HomeVariant;
  if (env.VERCEL_ENV !== "production") {
    const off = (env.PEEK_WEB ?? "").trim().toLowerCase();
    if (off === "off" || off === "0" || off === "false") return "b";
  }
  return MARKETING_DEFAULT;
}

/** True when the standalone marketing pages (/features, /pricing, /faq) should render in Peek. */
export function marketingPeek(env: Record<string, string | undefined> = process.env): boolean {
  return homeVariant(env) === "peek";
}
