import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/lib/supabase-browser", () => ({ getSupabase: () => { throw new Error("no supabase"); }, supabaseConfigured: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {}, replace() {} }), usePathname: () => "/dashboard", useSearchParams: () => new URLSearchParams() }));
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { LocaleProvider } from "@/lib/i18n/client";
import { AnalyticsScreen, formatDuration, type AnalyticsFixture } from "@/components/analytics-screen";
import { makeT } from "@/lib/i18n/index";

/** Parity Phase 1 (t353u) PR B: settings, account hub, Add screen, phone density, analytics i18n. Fake data only. */
const src = (f: string) => readFileSync(f, "utf8");
const ES_RULES = /\b(tú|tu cuenta|tienes|puedes|quieres|elige|escribe|ingresa|escanea|abre)\b|televisor|prueba gratuita|desconectad|programación|Inténtelo|Ingrese/i;

describe("dictionaries", () => {
  const keys = (Object.keys(en) as (keyof typeof en)[]).filter((k) => /^(an\.|addsc\.|acct\.(analytics|alerts)\.|settings\.tvAddress)/.test(k));
  it("every new key has Spanish in usted and the same placeholders", () => {
    expect(keys.length).toBeGreaterThan(70);
    for (const k of keys) {
      expect(es[k], k).toBeTruthy();
      expect(es[k], k).not.toMatch(ES_RULES);
      expect(es[k].match(/\{\w+\}/g)?.sort(), k).toEqual(en[k].match(/\{\w+\}/g)?.sort());
    }
  });
});

describe("Settings (W4)", () => {
  const s = src("app/dashboard/settings/page.tsx");
  it("has a Language card, puts Delete account last, and drops the duplicate Brand Kit card", () => {
    expect(s).toContain('data-testid="settings-language"');
    expect(s).toContain("<LanguageSelect refresh={false} />");
    expect(s).not.toContain('t("settings.brandTitle")');
    const order = ['t("settings.account")', "<BusinessForm", 'data-testid="settings-language"', "<AlertSettings", "onSubmit={saveName}", "onSubmit={changePassword}", 't("settings.signOutTitle")', 'data-testid="billing-link"', 'data-testid="support-link"', 'data-testid="settings-legal"', 'data-testid="delete-account-link"'];
    const at = order.map((needle) => s.indexOf(needle));
    for (const [i, pos] of at.entries()) expect(pos, order[i]).toBeGreaterThan(0);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it("shows one TV address (/tv), not /pair and /tv", () => {
    expect(s).toContain("{origin}/tv");
    expect(s).not.toContain("{origin}/pair");
  });
  it("keeps the auth calls untouched", () => {
    expect(s).toContain('signOut({ scope: "global" })');
    expect(s).toContain("updateUser");
  });
});

describe("Account hub (W2)", () => {
  const s = src("app/dashboard/account/page.tsx");
  it("links Analytics and Alerts next to settings, brand, billing and support", () => {
    for (const href of ["/dashboard/settings", "/dashboard/account/brand-kit", "/dashboard/billing", "/dashboard/analytics", "/dashboard/alerts", "/support"]) expect(s).toContain(`"${href}"`);
    expect(s).toContain('data-testid="account-hub"');
    expect(s.match(/<LanguageSelect/g)).toHaveLength(1);
  });
});

describe("Analytics i18n (W2)", () => {
  const fixture: AnalyticsFixture = {
    summary: {
      screens: { total: 2, online: 1, offline: 1, neverConnected: 0 },
      uptime: { pct7: 98.5, pct30: 97, coverageFrom: "2026-10-01T00:00:00Z" },
      playback: { confirmed: 1, unconfirmed: 1, nothingAssigned: 0 },
      playlists: { total: 2, published: 1, publishes30d: 3 },
      schedules: { total: 1, enabled: 1, changes30d: 2 },
      media: { count: 4, images: 3, videos: 1, bytes: 5_000_000, inPlaylists: 2, unused: 2 },
      bandwidth: null,
    },
    uptime: { days: 7, coverageFrom: "2026-10-01T00:00:00Z", overall: { uptimePct: 98 }, screens: [
      { id: "s1", name: "Demo Front", online: true, lastSeenAt: "2026-11-15T10:00:00Z", uptimePct: 99, onlineSeconds: 600000, windowSeconds: 604800, daily: [] },
    ] },
    activity: [{ at: "2026-11-15T09:00:00Z", kind: "screen.paired", subjectId: "s1", subjectName: "Demo Front", detail: {} }],
  };
  it("renders Spanish with no English left in the page copy", () => {
    const html = renderToStaticMarkup(createElement(LocaleProvider, { initial: "es", children: createElement(AnalyticsScreen, { fixture }) }));
    expect(html).toContain(es["an.title"]);
    expect(html).toContain(es["an.kind.screenPaired"]);
    for (const english of ["Analytics", "Screen paired", "Uptime", "Recent activity", "Media"]) expect(html, english).not.toContain(`>${english}<`);
  });
  it("still renders English by default", () => {
    const html = renderToStaticMarkup(createElement(LocaleProvider, { initial: "en", children: createElement(AnalyticsScreen, { fixture }) }));
    expect(html).toContain("Analytics");
    expect(html).toContain("Screen paired");
  });
  it("formatDuration keeps its old English output without a t()", () => {
    expect(formatDuration(59)).toBe(formatDuration(59, makeT("en")));
    expect(formatDuration(3 * 3600 + 120)).toBe(formatDuration(3 * 3600 + 120, makeT("en")));
  });
});

describe("Add screen (W1)", () => {
  it("is a focused pairing page with one /tv address, a copy button and a QR", () => {
    const page = src("app/dashboard/screens/add/page.tsx");
    expect(page).toContain("AddScreen");
    const c = src("components/add-screen.tsx");
    expect(c).toContain("`${window.location.origin}/tv`");
    expect(c).toContain('t("disp.copy")');
    expect(c).toContain('TV_QR_SRC = "/qr/tv.svg"');
    expect(c).toContain("<PairForm");
    expect(c).not.toContain("/pair`");
  });
  it("ships a static QR for the canonical TV address", () => {
    const svg = src("public/qr/tv.svg");
    expect(svg).toMatch(/^<\?xml|^<svg/);
    expect(svg).toContain('viewBox="0 0 33 33"');
  });
  it("keeps the legacy /dashboard/displays page and the pairing API unchanged", () => {
    expect(existsSync("app/dashboard/displays/page.tsx")).toBe(true);
    expect(src("components/displays-screen.tsx")).toContain('"/api/displays/pair"');
  });
  it("in-app links point at My Screens instead of the legacy list", () => {
    expect(src("components/overview-screen.tsx")).not.toContain("/dashboard/displays");
    expect(src("components/setup-tracker.tsx")).not.toContain("/dashboard/displays");
  });
  it("a screen's page can rename it and change its location (same PATCH as the legacy list)", () => {
    const m = src("components/my-screens.tsx");
    expect(m).toContain('JSON.stringify({ name })');
    expect(m).toContain('JSON.stringify({ locationId })');
    expect(m).toContain('data-testid="screen-location"');
  });
});

describe("Phone density (W3)", () => {
  it("screen cards put the status under the name on a phone", () => {
    expect(src("components/my-screens.tsx")).toMatch(/flex flex-col items-start gap-1 sm:flex-row[^"]*" data-testid="screen-card-head"/);
  });
  it("the alerts banner starts as one line on a phone with All alerts still one tap away", () => {
    const a = src("components/alerts.tsx");
    expect(a).toContain('matchMedia("(max-width: 639px)")');
    expect(a).toContain("open={open}");
    expect(a).toMatch(/<Link href="\/dashboard\/alerts" className="sm:hidden [^\n]*\{t\("alerts.all"\)\}<\/Link>/);
  });
  it("the billing banner only changes spacing", () => {
    const b = src("components/billing-banner.tsx");
    expect(b).toContain('"/api/entitlements"');
    expect(b).toContain("card mb-3 sm:mb-5");
  });
});
