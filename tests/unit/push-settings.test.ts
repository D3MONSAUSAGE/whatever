import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { AlertPrefs } from "@/lib/api";

// Push hardening (c): Settings toggle for alert_push_enabled, EN/ES; (d) ALERTS.md cutoff.

const prefs = vi.hoisted(() => ({ data: null as unknown }));
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return { ...real, useApi: () => ({ data: prefs.data, error: null, reload: async () => undefined }) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, replace() {} }), usePathname: () => "/dashboard/settings", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/supabase-browser", () => ({ getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) }));

const { AlertSettings } = await import("@/components/alerts");
const { LocaleProvider } = await import("@/lib/i18n/client");
const wrap = (locale: "en" | "es", node: ReactNode) => renderToStaticMarkup(createElement(LocaleProvider, { initial: locale, children: node }));

const base: AlertPrefs = {
  enabled: true, thresholdMinutes: 10,
  email: { enabled: true, available: true, address: "cafe@example.com" },
  push: { enabled: true, available: true },
  limits: { minMinutes: 2, maxMinutes: 1440 },
};

describe("Settings → phone notifications toggle", () => {
  it("shows a checked toggle in English", () => {
    prefs.data = base;
    const html = wrap("en", createElement(AlertSettings));
    expect(html).toContain("Send notifications to my phones with the Pekko app");
    expect(html).toContain("Applies to every phone signed in to this account.");
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(3);
  });
  it("Spanish copy (usted), and the 'not switched on yet' hint when push isn't available", () => {
    prefs.data = { ...base, push: { enabled: false, available: false } };
    const html = wrap("es", createElement(AlertSettings));
    expect(html).toContain("Enviar notificaciones a mis teléfonos con la app de Pekko");
    expect(html).toContain("Las notificaciones al teléfono todavía no están activadas en Pekko.");
    expect(html).not.toContain("Send notifications");
  });
  it("disabled while alerts are off; hidden when the server sends no push block", () => {
    prefs.data = { ...base, enabled: false };
    expect(wrap("en", createElement(AlertSettings))).toMatch(/type="checkbox"[^>]*disabled=""[^>]*\/>\s*<span>Send notifications/);
    prefs.data = { ...base, push: undefined };
    expect(wrap("en", createElement(AlertSettings))).not.toContain("Send notifications");
  });
  it("saves through the existing PATCH /api/alerts/preferences {pushEnabled}", () => {
    const src = readFileSync("components/alerts.tsx", "utf8");
    expect(src).toContain("save({ pushEnabled: e.target.checked })");
    expect(src).toContain('api("/api/alerts/preferences", { method: "PATCH"');
  });
  it("sign out of all devices clears push tokens server-side first, without blocking the sign-out", () => {
    const src = readFileSync("app/dashboard/settings/page.tsx", "utf8");
    const i = src.indexOf('"/api/session/sign-out"');
    expect(i).toBeGreaterThan(0);
    expect(src.indexOf('signOut({ scope: "global" })')).toBeGreaterThan(i);
    expect(src.slice(i, i + 200)).toContain(".catch(() => undefined)");
  });
});

describe("docs/ALERTS.md", () => {
  it("states the real 30-minute delivery cutoff", async () => {
    const doc = readFileSync("docs/ALERTS.md", "utf8");
    const { DELIVERY_MAX_AGE_MS } = await import("@/lib/server/alerts");
    expect(DELIVERY_MAX_AGE_MS).toBe(30 * 60_000);
    expect(doc).toContain("Alerts older than 30 minutes are never emailed or pushed");
    expect(doc).not.toMatch(/older than 6 h/);
    expect(doc).toContain("POST /api/push/test");
  });
});
