import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNT_TABS, activeAccountTab, isAccountPath } from "@/lib/account-nav";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

describe("redesign phase 4: Account section", () => {
  it("groups the existing Account pages under one tab bar without moving any URL", () => {
    expect(ACCOUNT_TABS.map((tab) => tab.href)).toEqual(["/dashboard/account", "/dashboard/settings", "/dashboard/account/brand-kit", "/dashboard/billing"]);
    expect(activeAccountTab("/dashboard/account")).toBe("overview");
    expect(activeAccountTab("/dashboard/account/brand-kit?x=1")).toBe("brand");
    expect(activeAccountTab("/dashboard/settings/delete")).toBe("settings");
    expect(activeAccountTab("/dashboard/billing/")).toBe("billing");
    expect(isAccountPath("/dashboard/screens")).toBe(false);
    expect(isAccountPath("/dashboard/settingsx")).toBe(false);
  });

  it("the shell shows it on Account pages, with guarded links", () => {
    const shell = readFileSync("components/shell.tsx", "utf8");
    expect(shell).toContain("{showAccountNav ? <AccountNav path={path} /> : null}");
    const nav = readFileSync("components/account-nav.tsx", "utf8");
    expect(nav).toContain("<StudioGuardedLink");
    expect(nav).toContain('aria-current={tab.id === current ? "page" : undefined}');
    for (const k of ["anav.aria", "anav.overview"] as const) {
      expect(es[k]).toBeTruthy();
      expect(es[k]).not.toBe(en[k]);
    }
  });
});

describe("redesign phase 4: Schedules", () => {
  const src = () => readFileSync("components/schedule-screen.tsx", "utf8");

  it("keeps every create form, inline edit and action label", () => {
    const s = src();
    for (const key of ["ss.locationName", "ss.addLocation", "ss.nameFor", "ss.saveName", "ss.deleteName", "ss.groupName", "ss.createGroup", "ss.addSchedule"]) {
      expect(s).toContain(`t("${key}"`);
    }
    expect(s.match(/className="ps-form-card"/g)).toHaveLength(3);
  });

  it("translates the times-of-day confirmation", () => {
    expect(src()).not.toContain("times of day added`");
    expect(src()).toContain('t("ss.dayPartsAdded", { n: res.ids.length })');
    expect(es["ss.dayPartsAdded"]).toContain("{n}");
  });

  it("uses the segmented control for the schedule views, still as tabs", () => {
    const views = readFileSync("components/schedule-views.tsx", "utf8");
    expect(views).toContain('role="tablist"');
    expect(views).toContain('className="seg seg-lg mb-6"');
    expect(views).toContain('role="tab" aria-selected={tab === id}');
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain('.seg > button[aria-selected="true"]');
  });
});
