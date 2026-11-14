import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { canonicalAuthRedirect, confirmPlan, safeAuthNext } from "@/lib/auth-confirm";
import { middleware } from "@/middleware";

const q = (s: string) => new URLSearchParams(s);

describe("B2-07A: /auth/confirm token_hash links", () => {
  it("accepts recovery, signup, email and email_change; refuses other types and bad hashes", () => {
    expect(confirmPlan(q("token_hash=abc123_-&type=recovery"))).toEqual({ ok: true, tokenHash: "abc123_-", type: "recovery", next: "/reset-password" });
    expect(confirmPlan(q("token_hash=h&type=signup"))).toEqual({ ok: true, tokenHash: "h", type: "signup", next: "/dashboard" });
    expect(confirmPlan(q("token_hash=h&type=email"))).toMatchObject({ ok: true, type: "email", next: "/dashboard" });
    expect(confirmPlan(q("token_hash=h&type=email_change"))).toMatchObject({ ok: true, type: "email_change", next: "/dashboard/account" });
    expect(confirmPlan(q("token_hash=h&type=magiclink"))).toEqual({ ok: false, reason: "type" });
    expect(confirmPlan(q("token_hash=h&type=invite"))).toEqual({ ok: false, reason: "type" });
    expect(confirmPlan(q("type=recovery"))).toEqual({ ok: false, reason: "missing" });
    expect(confirmPlan(q("token_hash=a%20b&type=recovery"))).toEqual({ ok: false, reason: "missing" });
    expect(confirmPlan(q(`token_hash=${"a".repeat(201)}&type=signup`))).toEqual({ ok: false, reason: "missing" });
  });

  it("recovery always continues to the reset page, whatever next says", () => {
    expect(confirmPlan(q("token_hash=h&type=recovery&next=/dashboard/billing"))).toMatchObject({ next: "/reset-password" });
    expect(confirmPlan(q("token_hash=h&type=recovery&next=https://evil.example/"))).toMatchObject({ next: "/reset-password" });
  });

  it("keeps next on the site: same-site paths and our own hosts only", () => {
    expect(safeAuthNext("/dashboard")).toBe("/dashboard");
    expect(safeAuthNext("/dashboard/screens?screen=abc")).toBe("/dashboard/screens?screen=abc");
    expect(safeAuthNext("https://pantalla-chi.vercel.app/dashboard")).toBe("/dashboard"); // Android +13
    expect(safeAuthNext("https://pekkotv.com/dashboard/account")).toBe("/dashboard/account");
    expect(safeAuthNext("https://www.pekkotv.com/reset-password")).toBe("/reset-password");
    for (const bad of [
      "https://evil.example/dashboard", "//evil.example/dashboard", "/\\evil.example", "http://pekkotv.com/dashboard",
      "https://pekkotv.com.evil.example/dashboard", "https://user@pekkotv.com/dashboard", "https://pekkotv.com:8443/dashboard",
      "javascript:alert(1)", "/login", "/api/me", "/dashboard/../api", "/dashboard#x", "", null, undefined, "x".repeat(400),
    ]) expect(safeAuthNext(bad as string)).toBeNull();
    expect(confirmPlan(q("token_hash=h&type=signup&next=https://evil.example/"))).toMatchObject({ next: "/dashboard" });
    expect(confirmPlan(q(`token_hash=h&type=signup&next=${encodeURIComponent("https://pekkotv.com/dashboard/screens")}`))).toMatchObject({ next: "/dashboard/screens" });
  });

  it("verifies only when the owner presses the button, with the browser client", () => {
    const page = readFileSync("app/auth/confirm/page.tsx", "utf8");
    expect(page).toMatch(/verifyOtp\(\{ token_hash: plan\.tokenHash, type: plan\.type \}\)/);
    expect(page).not.toMatch(/useEffect/);
    expect(page).toMatch(/onClick=\{\(\) => void confirm\(\)\}/);
    expect(page).toMatch(/location\.replace\(plan\.next\)/);
  });
});

describe("B2-07A: pantalla-chi sign-in pages move to pekkotv.com; TVs and the app API do not", () => {
  it("redirects only sign-in paths on the old host", () => {
    const old = "pantalla-chi.vercel.app";
    expect(canonicalAuthRedirect(old, "/auth/confirm", "?token_hash=h&type=recovery")).toBe("https://pekkotv.com/auth/confirm?token_hash=h&type=recovery");
    expect(canonicalAuthRedirect(old, "/dashboard", "")).toBe("https://pekkotv.com/dashboard");
    expect(canonicalAuthRedirect(old, "/dashboard/screens/add", "?x=1")).toBe("https://pekkotv.com/dashboard/screens/add?x=1");
    for (const p of ["/login", "/forgot-password", "/reset-password"]) expect(canonicalAuthRedirect(old, p, "")).toBe(`https://pekkotv.com${p}`);
    for (const p of ["/", "/tv", "/pair", "/player", "/player.html", "/api/player/state", "/api/player/pair/status", "/api/health", "/api/media", "/api/layout-studio/assign", "/dashboards", "/authx", "/layout-studio/media/font/inter"]) {
      expect(canonicalAuthRedirect(old, p, "")).toBeNull();
    }
    for (const h of ["pekkotv.com", "www.pekkotv.com", "pantalla-teamtegrate.vercel.app", "localhost:3000", null]) {
      expect(canonicalAuthRedirect(h, "/dashboard", "")).toBeNull();
    }
    expect(canonicalAuthRedirect("PANTALLA-CHI.vercel.app:443", "/login", "")).toBe("https://pekkotv.com/login");
  });

  it("middleware sends a 307 for sign-in paths and passes TV/API requests through", () => {
    const req = (url: string, host: string) => new NextRequest(url, { headers: { host } });
    const moved = middleware(req("https://pantalla-chi.vercel.app/dashboard?x=1", "pantalla-chi.vercel.app"));
    expect(moved.status).toBe(307);
    expect(moved.headers.get("location")).toBe("https://pekkotv.com/dashboard?x=1");
    for (const p of ["/tv", "/pair", "/player.html", "/api/player/state", "/api/displays"]) {
      const res = middleware(req(`https://pantalla-chi.vercel.app${p}`, "pantalla-chi.vercel.app"));
      expect(res.headers.get("location")).toBeNull();
      expect(res.status).toBe(200);
    }
    const canonical = middleware(req("https://pekkotv.com/dashboard", "pekkotv.com"));
    expect(canonical.headers.get("location")).toBeNull();
  });
});
