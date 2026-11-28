import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { fn: string; args: unknown[] }[] = [];
vi.mock("@heycatch/sdk", () => ({
  analytics: new Proxy({}, { get: (_t, fn: string) => (...args: unknown[]) => { calls.push({ fn, args }); } }),
}));
const optedOut = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/funnel-client", () => ({ browserOptedOut: () => optedOut.value, browserSignedIn: () => false }));

import { HEYCATCH_PROJECT_KEY, heycatchBeforeSend, heycatchInitConfig, heycatchPathSilent, scrubUrl } from "@/lib/heycatch";
import { identifyUser, resetUserIdentity, trackSignupCompleted } from "@/lib/heycatch-events";

class Store { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }
beforeEach(() => { calls.length = 0; optedOut.value = false; vi.stubGlobal("window", {}); vi.stubGlobal("localStorage", new Store()); vi.stubGlobal("sessionStorage", new Store()); });

const ev = (event: string, properties: Record<string, unknown> = {}) => ({ event, properties });

describe("HeyCatch beforeSend", () => {
  it("keeps every event on the public marketing pages, English and Spanish", () => {
    for (const p of ["/", "/es", "/pricing", "/es/pricing", "/features", "/faq", "/support", "/contact"]) {
      expect(heycatchBeforeSend(ev("$autocapture"), p), p).not.toBeNull();
      expect(heycatchBeforeSend(ev("$pageview", { title: "Pekko" }), p)!.properties!.title).toBe("Pekko");
    }
  });

  it("drops click-type autocapture and form events outside marketing, keeps pageviews, identity and our own events", () => {
    for (const p of ["/login", "/dashboard", "/dashboard/menus/abc", "/auth/confirm", "/reset-password", "/terms"]) {
      for (const name of ["$autocapture", "$rageclick", "$dead_click", "$copy_autocapture", "$exception", "$web_vitals"]) expect(heycatchBeforeSend(ev(name), p), p + name).toBeNull();
      for (const name of ["$pageview", "$pageleave", "$identify", "$set", "signup_completed"]) expect(heycatchBeforeSend(ev(name), p), p + name).not.toBeNull();
    }
  });

  it("does not count the redirect-only /signup route as a page of its own", () => {
    expect(heycatchBeforeSend(ev("$pageview"), "/signup")).toBeNull();
    expect(heycatchBeforeSend(ev("$pageview"), "/login")).not.toBeNull();
  });

  it("removes page titles (menu and screen names) outside marketing", () => {
    const out = heycatchBeforeSend(ev("$pageview", { title: "La Esquina - Main menu", $title: "x", $pathname: "/dashboard" }), "/dashboard")!;
    expect(out.properties).not.toHaveProperty("title");
    expect(out.properties).not.toHaveProperty("$title");
  });

  it("sends nothing from staff, developer and internal tool pages, or with no known path", () => {
    for (const p of ["/developer/analytics", "/developer", "/dashboard/staff", "/dashboard/staff/x", "/dev/layout-studio", "/preview", "/layout-studio/player", "/api/health"]) expect(heycatchBeforeSend(ev("$pageview"), p), p).toBeNull();
    expect(heycatchBeforeSend(ev("$pageview"), undefined)).toBeNull();
    expect(heycatchBeforeSend(null, "/")).toBeNull();
    expect(heycatchPathSilent("/developers-guide")).toBe(false);
  });

  it("scrubs tokens, codes, emails and fragments from every URL property", () => {
    const e = ev("$pageview", {
      $current_url: "https://pekkotv.com/auth/confirm?token_hash=abc&type=signup&next=%2Fdashboard#access_token=zzz",
      $referrer: "https://pekkotv.com/login?email=a%40b.com&mode=up",
      $session_entry_url: "https://pekkotv.com/?utm_source=heycatch&utm_campaign=x&code=123#frag",
    });
    const p = heycatchBeforeSend(e, "/auth/confirm")!.properties!;
    expect(p.$current_url).toBe("https://pekkotv.com/auth/confirm");
    expect(p.$referrer).toBe("https://pekkotv.com/login?mode=up");
    expect(p.$session_entry_url).toBe("https://pekkotv.com/?utm_source=heycatch&utm_campaign=x");
    expect(scrubUrl("not a url")).toBe("");
    expect(JSON.stringify(p)).not.toMatch(/token_hash|access_token|a%40b|@/);
  });
});

describe("HeyCatch init config and consent", () => {
  it("uses the project key and starts opted out when Do Not Track or Global Privacy Control is on", () => {
    expect(heycatchInitConfig().projectKey).toBe(HEYCATCH_PROJECT_KEY);
    expect(heycatchInitConfig().optOutCapturingByDefault).toBe(false);
    optedOut.value = true;
    expect(heycatchInitConfig().optOutCapturingByDefault).toBe(true);
    expect(heycatchInitConfig().respectDnt).toBe(true);
  });
  it("sets no site tag (marketing, sign-in and the app are one project)", () => {
    expect(heycatchInitConfig()).not.toHaveProperty("site");
  });
});

describe("signup_completed", () => {
  it("fires once per account with an opaque id and no personal data", () => {
    expect(trackSignupCompleted("11111111-2222-3333-4444-555555555555")).toBe(true);
    expect(trackSignupCompleted("11111111-2222-3333-4444-555555555555")).toBe(false);
    const sent = calls.filter((c) => c.fn === "trackEvent");
    expect(sent).toEqual([{ fn: "trackEvent", args: ["signup_completed", { method: "email_password" }] }]);
    expect(calls.filter((c) => c.fn === "setIdentity")).toEqual([{ fn: "setIdentity", args: ["11111111-2222-3333-4444-555555555555"] }]);
    expect(JSON.stringify(calls)).not.toMatch(/@/);
  });
  it("does nothing without a user id or when the browser opts out", () => {
    expect(trackSignupCompleted(undefined)).toBe(false);
    optedOut.value = true;
    expect(trackSignupCompleted("u1")).toBe(false);
    identifyUser("u1"); resetUserIdentity();
    expect(calls).toEqual([]);
  });
  it("identifies an account once per tab and clears it on sign-out", () => {
    identifyUser("u1"); identifyUser("u1");
    expect(calls.filter((c) => c.fn === "setIdentity")).toHaveLength(1);
    resetUserIdentity(); identifyUser("u1");
    expect(calls.filter((c) => c.fn === "setIdentity")).toHaveLength(2);
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("has a single init, in instrumentation-client.ts, and no leftover per-page mounts", () => {
    expect(read("instrumentation-client.ts")).toContain("analytics.init(heycatchInitConfig())");
    for (const p of ["app/page.tsx", "app/features/page.tsx", "app/pricing/page.tsx", "app/faq/page.tsx", "app/support/page.tsx", "app/contact/page.tsx"]) expect(read(p)).not.toContain("HeyCatch");
  });
  it("tracks signup completion only where creation is confirmed", () => {
    expect(read("app/auth/confirm/page.tsx")).toMatch(/plan\.type === "signup"\) trackSignupCompleted/);
    expect(read("app/login/page.tsx")).toMatch(/mode === "up"\) trackSignupCompleted/);
  });
});
