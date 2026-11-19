/**
 * Which home page to serve. The Option B home is the default. HOME_VARIANT=classic serves the previous home
 * page (components/site/marketing/home-classic.tsx), kept as the planned rollback; it takes effect on the
 * next deployment, with no code change.
 */
export type HomeVariant = "b" | "classic";

export function homeVariant(env: Record<string, string | undefined> = process.env): HomeVariant {
  return (env.HOME_VARIANT ?? "").trim().toLowerCase() === "classic" ? "classic" : "b";
}
