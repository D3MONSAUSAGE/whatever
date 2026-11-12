import { describe, expect, it, vi } from "vitest";
import { startAttributionPersist, type PersistDeps } from "@/lib/signup-attribution-persist";
import { readFileSync } from "node:fs";

const values = {
  utm_source: "meta",
  utm_medium: "paid",
  utm_campaign: "pekko-qa-1112",
  utm_content: "qa-check",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeDeps(overrides: Partial<PersistDeps> & { sent?: { value: boolean } } = {}) {
  const sent = overrides.sent ?? { value: false };
  const posts: { token: string; values: typeof values }[] = [];
  let authCb: ((token: string | null, event: string) => void) | null = null;
  const deps: PersistDeps = {
    getToken: overrides.getToken ?? (async () => null),
    onAuth: overrides.onAuth ?? ((cb) => {
      authCb = cb;
      return () => {
        authCb = null;
      };
    }),
    post: overrides.post ?? (async (token, body) => {
      posts.push({ token, values: body as typeof values });
      return true;
    }),
    isSent: overrides.isSent ?? (() => sent.value),
    markSent: overrides.markSent ?? (() => {
      sent.value = true;
    }),
    clearSent: overrides.clearSent ?? (() => {
      sent.value = false;
    }),
  };
  return { deps, posts, sent, fire: (token: string | null, event: string) => authCb?.(token, event) };
}

describe("startAttributionPersist", () => {
  it("does not post on a session-less mount, then posts when SIGNED_IN fires", async () => {
    const session = deferred<string | null>();
    const { deps, posts, sent, fire } = makeDeps({ getToken: () => session.promise });
    const stop = startAttributionPersist(values, deps);

    session.resolve(null);
    await session.promise;
    await Promise.resolve();
    expect(posts).toEqual([]);
    expect(sent.value).toBe(false);

    fire("new-session-token", "SIGNED_IN");
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ token: "new-session-token", values });
    expect(sent.value).toBe(true);

    fire("new-session-token", "SIGNED_IN");
    await Promise.resolve();
    expect(posts).toHaveLength(1);
    stop();
  });

  it("posts immediately when a session already exists on mount", async () => {
    const { deps, posts } = makeDeps({ getToken: async () => "existing-token" });
    const stop = startAttributionPersist(values, deps);
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].token).toBe("existing-token");
    stop();
  });

  it("skips when there is nothing captured", async () => {
    const { deps, posts, fire } = makeDeps({ getToken: async () => "token" });
    const stop = startAttributionPersist(null, deps);
    await Promise.resolve();
    fire("token", "SIGNED_IN");
    await Promise.resolve();
    expect(posts).toHaveLength(0);
    stop();
  });

  it("clears the sent flag on SIGNED_OUT so a later signup can post", async () => {
    const { deps, posts, sent, fire } = makeDeps({ getToken: async () => null, sent: { value: true } });
    const stop = startAttributionPersist(values, deps);
    expect(sent.value).toBe(true);
    fire(null, "SIGNED_OUT");
    expect(sent.value).toBe(false);
    fire("second-account-token", "SIGNED_IN");
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].token).toBe("second-account-token");
    stop();
  });

  it("does not mark sent when the POST fails, and retries on the next event", async () => {
    let ok = false;
    const { deps, fire } = makeDeps({
      getToken: async () => null,
      post: async () => ok,
    });
    const stop = startAttributionPersist(values, deps);
    fire("token", "SIGNED_IN");
    await vi.waitFor(() => expect(deps.isSent()).toBe(false));
    ok = true;
    fire("token", "INITIAL_SESSION");
    await vi.waitFor(() => expect(deps.isSent()).toBe(true));
    stop();
  });
});

describe("SignupAttribution wiring", () => {
  it("listens for auth changes instead of posting only on mount", () => {
    const source = readFileSync("components/signup-attribution.tsx", "utf8");
    expect(source).toContain("startAttributionPersist");
    expect(source).toContain("onAuthStateChange");
    expect(readFileSync("lib/signup-attribution-persist.ts", "utf8")).toContain("SIGNED_IN");
    expect(readFileSync("lib/signup-attribution-persist.ts", "utf8")).toContain("SIGNED_OUT");
  });
});
