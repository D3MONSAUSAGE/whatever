/**
 * R14-01: after a deploy, an open dashboard tab still runs the old build. When it navigates, it asks for JS/CSS
 * chunks the new deployment no longer serves, and Next shows the error page. One full reload fixes it.
 *
 * Strict on purpose:
 * - only chunk-load failures (ChunkLoadError, "Loading chunk … failed", "Loading CSS chunk … failed");
 * - only on the web dashboard (/dashboard…); TVs use public/player.html, which never runs this code;
 * - at most ONE reload per build id per tab session (sessionStorage flag). Once the flag is set, never again,
 *   including from app/error.tsx and app/global-error.tsx. If sessionStorage is unavailable, never reload.
 */
export const CHUNK_RELOAD_KEY_PREFIX = "pekko_chunk_reload:";

/** The build this tab is running. Vercel exposes these to the browser at build time; "local" otherwise. */
export function currentBuildId(): string {
  return process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID || "local";
}

const CHUNK_MESSAGE = /Loading (CSS )?chunk [\w./-]+ failed/;

/** True only for a chunk-load failure (Error, error-like object, rejection reason or message string). */
export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "string") return CHUNK_MESSAGE.test(err);
  if (typeof err !== "object") return false;
  const e = err as { name?: unknown; message?: unknown };
  if (e.name === "ChunkLoadError") return true;
  return typeof e.message === "string" && CHUNK_MESSAGE.test(e.message);
}

export function isDashboardPath(pathname: string | null | undefined): boolean {
  return typeof pathname === "string" && (pathname === "/dashboard" || pathname.startsWith("/dashboard/"));
}

export type ChunkReloadEnv = {
  pathname: string | null | undefined;
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined;
  reload: () => void;
  buildId?: string;
};

/**
 * Reloads once when `err` is a chunk-load failure on the dashboard and this build has not reloaded in this tab yet.
 * Returns true when it triggered the reload. The flag is written BEFORE reloading; if it cannot be written, no reload.
 */
export function reloadOnceOnChunkError(err: unknown, env: ChunkReloadEnv): boolean {
  if (!isChunkLoadError(err) || !isDashboardPath(env.pathname) || !env.storage) return false;
  const key = CHUNK_RELOAD_KEY_PREFIX + (env.buildId ?? currentBuildId());
  try {
    if (env.storage.getItem(key) !== null) return false;
    env.storage.setItem(key, String(Date.now()));
    if (env.storage.getItem(key) === null) return false;
  } catch {
    return false;
  }
  env.reload();
  return true;
}

/** Browser wiring: the real location, sessionStorage and reload. Safe to call anywhere; no-op on the server. */
export function reloadOnceOnChunkErrorInBrowser(err: unknown): boolean {
  if (typeof window === "undefined") return false;
  let storage: Storage | null = null;
  try { storage = window.sessionStorage; } catch { storage = null; }
  return reloadOnceOnChunkError(err, { pathname: window.location.pathname, storage, reload: () => window.location.reload() });
}
