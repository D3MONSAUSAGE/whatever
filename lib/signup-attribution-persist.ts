import type { Attribution } from "@/lib/signup-attribution";

export type PersistResult = "skipped" | "sent" | "failed";

export type PersistDeps = {
  getToken: () => Promise<string | null>;
  /** Calls back with the access token (or null) and the auth event name. Returns an unsubscribe. */
  onAuth: (cb: (token: string | null, event: string) => void) => () => void;
  post: (token: string, values: Attribution) => Promise<boolean>;
  isSent: () => boolean;
  markSent: () => void;
  clearSent: () => void;
};

/**
 * First-touch values are captured on the public landing, often with no session.
 * The root layout stays mounted across the client-side jump from signup to
 * /dashboard, so a one-shot getSession() on mount never sees the new session.
 * This listens for SIGNED_IN (and retries getSession) and posts then.
 */
export function startAttributionPersist(values: Attribution | null, deps: PersistDeps): () => void {
  let cancelled = false;
  let inFlight = false;

  async function attempt(token: string | null): Promise<PersistResult> {
    if (cancelled || !values || !token || deps.isSent()) return "skipped";
    if (inFlight) return "skipped";
    inFlight = true;
    try {
      const ok = await deps.post(token, values);
      if (cancelled) return "skipped";
      if (ok) {
        deps.markSent();
        return "sent";
      }
      return "failed";
    } catch {
      return "failed";
    } finally {
      inFlight = false;
    }
  }

  void deps.getToken().then((token) => attempt(token));
  const unsubscribe = deps.onAuth((token, event) => {
    if (event === "SIGNED_OUT") {
      deps.clearSent();
      return;
    }
    void attempt(token);
  });

  return () => {
    cancelled = true;
    unsubscribe();
  };
}
