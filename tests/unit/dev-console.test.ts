import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dashboard } from "@/app/developer/analytics/client";
import { LocaleProvider } from "@/lib/i18n/client";
import { en, es } from "@/lib/i18n/index";
import { DEFAULT_INTERNAL_DOMAINS } from "@/lib/server/dev-analytics/exclusions";
import { computeDashboard } from "@/lib/server/dev-analytics/metrics";
import { parseRange } from "@/lib/server/dev-analytics/range";
import { billing, NOW, snapshot, teamtegrateBilling, teamtegrateSnapshot } from "../fixtures/dev-analytics";

const data = (team = false) => computeDashboard({
  snapshot: team ? teamtegrateSnapshot() : snapshot(), billing: team ? teamtegrateBilling() : billing(),
  range: parseRange(new URLSearchParams("range=30d"), NOW)!, now: NOW, includeInternal: false, domains: [...DEFAULT_INTERNAL_DOMAINS],
});
const html = (locale: "en" | "es", team = false) =>
  renderToStaticMarkup(createElement(LocaleProvider, { initial: locale, children: createElement(Dashboard, { data: data(team) }) }));

describe("developer console layout", () => {
  it("shows the five sections in order, in English and Spanish", () => {
    for (const locale of ["en", "es"] as const) {
      const out = html(locale);
      const ids = ["overview", "activation", "revenue", "screens", "health"].map((id) => out.indexOf(`data-testid="dev-section-${id}"`));
      expect(ids.every((i) => i >= 0), locale).toBe(true);
      expect([...ids].sort((a, b) => a - b)).toEqual(ids);
      const dict = locale === "es" ? es : en;
      for (const k of ["dc.tab.activation", "dc.tab.revenue", "dc.rev.noHistoryTitle", "dc.hl.sourcesTitle"] as const) {
        expect(out, k).toContain(dict[k].replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
      }
      // No raw keys or broken numbers leak into the page.
      expect(out).not.toMatch(/\b(dc|dev)\.[a-z]+\.[a-zA-Z]+\b/);
      expect(out).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("keeps the data-quality notes and never draws invented revenue history", () => {
    const out = html("en");
    expect(out).toContain('data-testid="dev-notes"');
    expect(out).toContain(en["dev.note.billingFromStripe"]);
    expect(out).toContain(en["dc.rev.noHistoryBody"].replace(/'/g, "&#x27;"));
    // The only time series drawn are the weekly cohorts and the daily publishing counts the API already returns.
    const d = data();
    expect(out.match(/class="dc-chart"/g)?.length).toBe(d.retention.cohorts.length ? 2 : 1);
  });

  it("shows hidden small groups as <3, never as zero", () => {
    const d = data(true);
    const out = html("en", true);
    const hiddenSteps = d.funnel.steps.filter((s) => s.reached === null).length;
    // A hidden group gets the striped placeholder bar and "<3"; a real zero gets an empty bar and "0".
    expect((out.match(/dc-fill-hidden/g) ?? []).length).toBeGreaterThanOrEqual(hiddenSteps);
    if (hiddenSteps) expect(out).toContain("&lt;3");
  });
});
