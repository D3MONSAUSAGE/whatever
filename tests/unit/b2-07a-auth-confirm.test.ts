import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { canonicalAuthRedirect, confirmPlan, safeAuthNext } from "@/lib/auth-confirm";
import { middleware } from "@/middleware";
import { captureFirstTouch, isSensitiveReferrer, sanitizeAttribution } from "@/lib/signup-attribution";
import nextConfig from "@/next.config";
import { en } from "@/lib/i18n/en";

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
    // The only effect cleans the URL; it never verifies on load.
    const effect = page.slice(page.indexOf("useEffect(() => {"), page.indexOf("}, []);"));
    expect(effect).toMatch(/window\.history\.replaceState\(null, "", CLEAN_CONFIRM_PATH\)/);
    expect(effect).not.toMatch(/verifyOtp|confirm\(/);
    expect(page.match(/useEffect\(/g)).toHaveLength(1);
    // token_hash/type are read once into state, so they survive the URL being cleaned.
    expect(page).toMatch(/const \[plan\] = useState\(\(\) => confirmPlan\(/);
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
    for (const p of ["/login", "/forgot-password", "/reset-password", "/login/", "/forgot-password/", "/reset-password/"]) expect(canonicalAuthRedirect(old, p, "")).toBe(`https://pekkotv.com${p}`);
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

describe("B2-07A: the email link token never leaks (Gother MEDIUM)", () => {
  it("(a) /auth/* sends Referrer-Policy: no-referrer; the rest of the site keeps its policy", async () => {
    const rules = await nextConfig.headers!();
    const auth = rules.find((r) => r.source === "/auth/:path*");
    expect(auth?.headers).toContainEqual({ key: "Referrer-Policy", value: "no-referrer" });
    expect(auth?.headers.filter((h) => h.key === "Referrer-Policy")).toHaveLength(1);
    expect(auth?.headers).toContainEqual({ key: "X-Content-Type-Options", value: "nosniff" });
    // Listed after the catch-all so it wins for /auth/*.
    expect(rules.findIndex((r) => r.source === "/auth/:path*")).toBeGreaterThan(rules.findIndex((r) => r.source === "/:path*"));
    expect(rules.find((r) => r.source === "/:path*")?.headers).toContainEqual({ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" });
    const layout = readFileSync("app/auth/confirm/layout.tsx", "utf8");
    expect(layout).toMatch(/referrer: "no-referrer"/);
  });

  it("(b) the URL is cleaned to /auth/confirm right after reading it", () => {
    const page = readFileSync("app/auth/confirm/page.tsx", "utf8");
    expect(page).toMatch(/CLEAN_CONFIRM_PATH/);
    expect(readFileSync("lib/auth-confirm.ts", "utf8")).toMatch(/export const CLEAN_CONFIRM_PATH = "\/auth\/confirm";/);
  });

  it("(c) auth links are never stored as an attribution referrer", () => {
    for (const bad of [
      "https://pekkotv.com/auth/confirm?token_hash=abc&type=recovery",
      "https://pekkotv.com/auth/confirm",
      "https://pantalla-chi.vercel.app/auth/confirm?token_hash=abc",
      "https://pekkotv.com/reset-password#access_token=x&type=recovery",
      "https://pekkotv.com/dashboard?code=123",
      "https://iybmjtkjfxcqupvhoddh.supabase.co/auth/v1/verify?token=abc&type=recovery",
    ]) {
      expect(isSensitiveReferrer(bad), bad).toBe(true);
      expect(sanitizeAttribution({ referrer: bad })).toBeNull();
      expect(captureFirstTouch("?utm_source=email", bad, null)).toEqual({ utm_source: "email" });
    }
    expect(isSensitiveReferrer("https://www.google.com/")).toBe(false);
    expect(sanitizeAttribution({ referrer: "https://pekkotv.com/pricing" })).toEqual({ referrer: "https://pekkotv.com/pricing" });
  });

  it("wrong link types get their own message", () => {
    const page = readFileSync("app/auth/confirm/page.tsx", "utf8");
    expect(page).toMatch(/plan\.reason === "type" \? t\("auth\.linkType"\)/);
    // I18N-1: the copy now lives in the dictionary.
    expect(en["auth.linkType"]).toMatch(/This kind of email link isn't used by Pekko/);
  });
});
