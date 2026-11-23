import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isChunkLoadError, isDashboardPath, reloadOnceOnChunkError, CHUNK_RELOAD_KEY_PREFIX } from "@/lib/chunk-reload";

function memStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, v); }, m };
}
const chunkErr = () => Object.assign(new Error("Loading chunk 4821 failed.\n(error: https://pekkotv.com/_next/static/chunks/4821-abc.js)"), { name: "ChunkLoadError" });

describe("R14-01 chunk-load detection is strict", () => {
  it("matches ChunkLoadError and webpack JS/CSS chunk messages", () => {
    expect(isChunkLoadError(chunkErr())).toBe(true);
    expect(isChunkLoadError({ name: "ChunkLoadError", message: "" })).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk app/dashboard/billing/page failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Loading CSS chunk 77 failed.\n(/_next/static/css/77.css)"))).toBe(true);
    expect(isChunkLoadError("Uncaught Error: Loading chunk 12 failed.")).toBe(true);
  });
  it("ignores every other error", () => {
    for (const e of [null, undefined, 0, "", "boom", new Error("Failed to fetch"), new TypeError("x is undefined"),
      new Error("Hydration failed"), new Error("NEXT_REDIRECT"), { message: 42 }, new Error("Loading chunks")]) {
      expect(isChunkLoadError(e), String(e)).toBe(false);
    }
  });
  it("dashboard paths only", () => {
    expect(isDashboardPath("/dashboard")).toBe(true);
    expect(isDashboardPath("/dashboard/billing")).toBe(true);
    for (const p of ["/", "/tv", "/pair", "/player", "/player.html", "/login", "/terms", "/dashboardx", null, undefined]) expect(isDashboardPath(p as string)).toBe(false);
  });
});

describe("R14-01 reload once per build id", () => {
  it("reloads once, writes the flag first, then never again for that build", () => {
    const storage = memStorage();
    const reload = vi.fn();
    const env = { pathname: "/dashboard/billing", storage, reload, buildId: "b1" };
    expect(reloadOnceOnChunkError(chunkErr(), env)).toBe(true);
    expect(storage.m.has(CHUNK_RELOAD_KEY_PREFIX + "b1")).toBe(true);
    // second failure in the same tab (e.g. from global-error after the reload): no reload
    expect(reloadOnceOnChunkError(chunkErr(), env)).toBe(false);
    expect(reloadOnceOnChunkError(chunkErr(), { ...env, pathname: "/dashboard" })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("a new build gets its own single reload", () => {
    const storage = memStorage();
    const reload = vi.fn();
    reloadOnceOnChunkError(chunkErr(), { pathname: "/dashboard", storage, reload, buildId: "b1" });
    reloadOnceOnChunkError(chunkErr(), { pathname: "/dashboard", storage, reload, buildId: "b2" });
    reloadOnceOnChunkError(chunkErr(), { pathname: "/dashboard", storage, reload, buildId: "b2" });
    expect(reload).toHaveBeenCalledTimes(2);
  });
  it("never reloads for non-chunk errors, outside the dashboard, or without working sessionStorage", () => {
    const reload = vi.fn();
    expect(reloadOnceOnChunkError(new Error("boom"), { pathname: "/dashboard", storage: memStorage(), reload, buildId: "b" })).toBe(false);
    expect(reloadOnceOnChunkError(chunkErr(), { pathname: "/login", storage: memStorage(), reload, buildId: "b" })).toBe(false);
    expect(reloadOnceOnChunkError(chunkErr(), { pathname: "/dashboard", storage: null, reload, buildId: "b" })).toBe(false);
    const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(reloadOnceOnChunkError(chunkErr(), { pathname: "/dashboard", storage: throwing, reload, buildId: "b" })).toBe(false);
    const dropping = { getItem: () => null, setItem: () => {} }; // flag can't persist -> could loop -> refuse
    expect(reloadOnceOnChunkError(chunkErr(), { pathname: "/dashboard", storage: dropping, reload, buildId: "b" })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("R14-01 wiring", () => {
  it("is mounted in the dashboard layout and both error boundaries, and the player is untouched", () => {
    expect(readFileSync("app/dashboard/layout.tsx", "utf8")).toContain("<ChunkReloadGuard />");
    expect(readFileSync("app/error.tsx", "utf8")).toContain("reloadOnceOnChunkErrorInBrowser(error)");
    expect(readFileSync("app/global-error.tsx", "utf8")).toContain("reloadOnceOnChunkErrorInBrowser(error)");
    expect(readFileSync("app/layout.tsx", "utf8")).not.toContain("ChunkReloadGuard");
    const sha = createHash("sha256").update(readFileSync("public/player.html")).digest("hex");
    expect(sha).toBe("ceff42b5a134e9b7dd7ded940e8cbb1c2721800ec60541d35622b81e8fea5989");
    expect(readFileSync("public/player.html", "utf8")).not.toMatch(/pekko_chunk_reload/);
  });
  it("global error page is self-contained (no dictionary import)", () => {
    const src = readFileSync("components/global-error-view.tsx", "utf8") + readFileSync("app/global-error.tsx", "utf8");
    expect(src).not.toMatch(/from "@\/lib\/i18n"|lib\/i18n\/(en|es)|makeT/);
  });
});
