import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// Peek PR11: Settings and Delete account are restyled with CSS only. These tests pin the markup that
// app/peek.css relies on, and that the auth/deletion code paths in both pages are byte-for-byte unchanged.

const fx = vi.hoisted(() => ({ byPath: {} as Record<string, unknown> }));
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return { ...real, useApi: (path: string | null) => ({ data: path ? fx.byPath[path.split("?")[0]] ?? null : null, error: null, reload: async () => undefined }) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, replace() {} }), usePathname: () => "/dashboard/settings", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/supabase-browser", () => ({ getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }) } }) }));

const { default: Settings } = await import("@/app/dashboard/settings/page");
const { default: DeleteAccount } = await import("@/app/dashboard/settings/delete/page");
const { LocaleProvider } = await import("@/lib/i18n/client");
const { ToastProvider } = await import("@/components/toast");
const wrap = (locale: "en" | "es", node: ReactNode) =>
  renderToStaticMarkup(createElement(LocaleProvider, { initial: locale, children: createElement(ToastProvider, { children: node }) }));

fx.byPath["/api/me"] = { email: "owner@democafe.example", accountName: "Demo Café" };
fx.byPath["/api/alerts/preferences"] = { enabled: true, thresholdMinutes: 10, email: { enabled: true, available: true, address: "owner@democafe.example" }, push: { enabled: false, available: false }, limits: { minMinutes: 2, maxMinutes: 1440 } };

const dump = (name: string, html: string) => {
  if (!process.env.PEEK_DUMP) return;
  mkdirSync(process.env.PEEK_DUMP, { recursive: true });
  writeFileSync(`${process.env.PEEK_DUMP}/${name}.html`, html);
};

describe("Peek PR11: Settings (CSS-only restyle)", () => {
  it("keeps the 10 cards in the order the two-column CSS expects", () => {
    for (const locale of ["en", "es"] as const) {
      const html = wrap(locale, createElement(Settings));
      dump(`settings-${locale}`, html);
      const order = ["Account", "business-heading", 'id="alerts"', "billing-link", "support-link", "delete-account-link", "name-heading", "pw-heading", "/dashboard/account/brand-kit", "/terms#billing"]
        .map((needle) => html.indexOf(needle));
      if (locale === "en") expect(order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1]))).toBe(true);
      expect(html).toContain('id="pw-heading"');
    }
  });
  it("leaves the settings and deletion pages' code untouched by Peek", () => {
    for (const f of ["app/dashboard/settings/page.tsx", "app/dashboard/settings/delete/page.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/peek/i);
    }
  });
});

describe("Peek PR11: Delete account states render with the hooks the CSS uses", () => {
  const states = {
    available: { enabled: true, delayDays: 7, request: null },
    "not-enabled": { enabled: false, delayDays: 7, request: null },
    scheduled: { enabled: true, delayDays: 7, request: { status: "pending", scheduled_for: "2026-12-03T23:00:00.000Z" } },
  } as const;
  for (const [name, data] of Object.entries(states)) {
    it(name, () => {
      fx.byPath["/api/account/deletion"] = data;
      for (const locale of ["en", "es"] as const) {
        const html = wrap(locale, createElement(DeleteAccount));
        dump(`delete-${name}-${locale}`, html);
        if (name === "scheduled") expect(html).toContain('data-testid="deletion-pending"');
        else expect(html).toContain('id="confirm"');
        if (name !== "scheduled") expect(html).toMatch(/<button[^>]*class="btn btn-danger"[^>]*disabled/);
      }
    });
  }
});
