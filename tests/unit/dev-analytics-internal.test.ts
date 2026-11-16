import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dashboard } from "@/app/developer/analytics/client";
import { LocaleProvider } from "@/lib/i18n/client";
import { DEFAULT_INTERNAL_DOMAINS } from "@/lib/server/dev-analytics/exclusions";
import { computeDashboard } from "@/lib/server/dev-analytics/metrics";
import { parseRange } from "@/lib/server/dev-analytics/range";
import { NOW, teamtegrateBilling, teamtegrateSnapshot } from "../fixtures/dev-analytics";

const run = (includeInternal: boolean) => computeDashboard({
  snapshot: teamtegrateSnapshot(), billing: teamtegrateBilling(), range: parseRange(new URLSearchParams("range=30d"), NOW)!,
  now: NOW, includeInternal, domains: [...DEFAULT_INTERNAL_DOMAINS],
});

describe("DA-1 include internal accounts", () => {
  it("leaves Teamtegrate and its Stripe subscription out by default", () => {
    const d = run(false);
    expect(d.population.includeInternal).toBe(false);
    expect(d.population.customerAccounts).toBe(6);
    expect(d.overview.billing).toMatchObject({ paying: 0, scheduledToCancel: 0, excludedSubscriptions: 1, mrr: { amount: 0, currency: "usd" } });
    expect(d.funnel.steps.find((s) => s.key === "paid")!.anyOrder).toBe(0);
  });
  it("counts Teamtegrate in every section when on: paying 1, MRR $59", () => {
    const d = run(true);
    expect(d.population.includeInternal).toBe(true);
    expect(d.population.customerAccounts).toBe(10);
    expect(d.overview.billing).toMatchObject({ paying: 1, scheduledToCancel: 1, excludedSubscriptions: 0, unmappedSubscriptions: 0, mrr: { amount: 5900, currency: "usd" } });
    expect(d.overview.accounts.total).toBe(10);
    // Small-group suppression still applies: a single paid account in the funnel shows as hidden.
    expect(d.funnel.steps.find((s) => s.key === "paid")!.anyOrder).toBeNull();
    for (const section of [d.overview, d.funnel, d.engagement, d.retention, d.attribution]) {
      expect(section.notes.map((n) => n.key)).toContain("internalIncluded");
    }
  });
  it("shows the banner only when on, in English and Spanish", () => {
    const html = (includeInternal: boolean, locale: "en" | "es") =>
      renderToStaticMarkup(createElement(LocaleProvider, { initial: locale, children: createElement(Dashboard, { data: run(includeInternal) }) }));
    expect(html(false, "en")).not.toContain("dev-internal-banner");
    expect(html(true, "en")).toContain("Including internal/test accounts");
    expect(html(true, "es")).toContain("Incluye cuentas internas y de prueba");
    expect(html(true, "en")).toContain("$59.00");
    expect(html(false, "en")).toContain("$0.00");
    expect(html(true, "en")).toContain("Paying customers (incl. internal)");
    expect(html(true, "es")).toContain("Clientes que pagan (con internas)");
    expect(html(false, "en")).not.toContain("(incl. internal)");
  });
});
