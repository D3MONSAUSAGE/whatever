import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// Peek PR12: Plan & billing is restyled with CSS only. Pins the hooks app/peek.css uses and that the
// billing page (Stripe checkout/portal calls, entitlement logic) has no Peek code at all.

const fx = vi.hoisted(() => ({ byPath: {} as Record<string, unknown> }));
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return { ...real, useApi: (path: string | null) => ({ data: path ? fx.byPath[path.split("?")[0]] ?? null : null, error: null, reload: async () => undefined }) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, replace() {} }), usePathname: () => "/dashboard/billing", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/supabase-browser", () => ({ getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) }));

const { default: Billing } = await import("@/app/dashboard/billing/page");
const { LocaleProvider } = await import("@/lib/i18n/client");
const { ToastProvider } = await import("@/components/toast");
const wrap = (locale: "en" | "es", node: ReactNode) =>
  renderToStaticMarkup(createElement(LocaleProvider, { initial: locale, children: createElement(ToastProvider, { children: node }) }));

const base = {
  plan: "trial", plan_name: "Free trial", warning: null, is_owner: true, checkout_pending: null,
  screen_limit: 5, active_screens: 3, total_screens: 5, can_add_screen: true, playback_allowed: true, enforced: true,
  trial: { started_at: "2026-11-20T00:00:00Z", ends_at: "2026-12-04T23:00:00Z", days_left: 8 }, subscription: null, suspend_at: null,
};
const states: Record<string, object> = {
  trial: { ...base, state: "trial" },
  "past-due": { ...base, state: "past_due", plan: "business", plan_name: "Business", trial: null, subscription: { status: "past_due", current_period_end: "2026-12-20T00:00:00Z", cancel_at_period_end: false }, warning: { kind: "past_due", message: "Your last payment didn't go through. Update your card to keep your screens playing." } },
  canceling: { ...base, state: "active", plan: "starter", plan_name: "Starter", trial: null, subscription: { status: "active", current_period_end: "2026-12-20T00:00:00Z", cancel_at_period_end: true } },
};
const displays = ["Front counter", "Kitchen", "Drive-thru", "Bar TV", "Patio"].map((name, i) => ({ id: `d${i}`, name, entitled: i < 3 }));

describe("Peek PR12: Plan & billing (CSS-only restyle)", () => {
  it("billing page file has no Peek code", () => {
    expect(readFileSync("app/dashboard/billing/page.tsx", "utf8")).not.toMatch(/peek/i);
  });
  for (const [name, ent] of Object.entries(states)) {
    it(`${name}: renders the hooks the CSS uses`, () => {
      fx.byPath["/api/entitlements"] = ent;
      fx.byPath["/api/displays"] = displays;
      fx.byPath["/api/billing/checkout"] = { available: true };
      for (const locale of ["en", "es"] as const) {
        const html = wrap(locale, createElement(Billing));
        if (process.env.PEEK_DUMP) { mkdirSync(process.env.PEEK_DUMP, { recursive: true }); writeFileSync(`${process.env.PEEK_DUMP}/billing-${name}-${locale}.html`, html); }
        for (const hook of ['data-testid="page-header"', 'data-testid="plan-status"', 'id="plans"', 'id="screens"', 'data-testid="plan-status-label"']) expect(html).toContain(hook);
      }
    });
  }
});
