import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findOverlaps, isOvernight, isPastRange, overlapDays, overnightMessage, winner, type RuleLike } from "@/lib/schedule-checks";
import { dayPartSources, DAY_PART_PRIORITY } from "@/lib/day-part-sources";
import { DAY_PARTS } from "@/lib/menu-templates";
import { togglePicks } from "@/lib/pick-order";
import { PROMO_TEMPLATES, parsePromoContent, placeholderFields, samplePromo } from "@/lib/promo-templates";
import { friendlyAuthError } from "@/components/auth-frame";
import { compareRules, type ScheduleRule } from "@/lib/server/schedule";

const rule = (patch: Partial<RuleLike>): RuleLike => ({
  name: "Rule", displayId: "tv", groupId: null, weekdays: [1, 2, 3, 4, 5, 6, 7], startTime: "07:00", endTime: "11:00",
  startsOn: null, endsOn: null, priority: 0, enabled: true, ...patch,
});

describe("B2-02 overnight windows", () => {
  it("flags end-before-start, not 24:00 or normal windows", () => {
    expect(isOvernight("15:00", "13:00")).toBe(true);
    expect(isOvernight("22:00", "02:00")).toBe(true);
    expect(isOvernight("11:00", "24:00")).toBe(false);
    expect(isOvernight("11:00", "00:00")).toBe(false);
    expect(isOvernight("11:00", "14:00")).toBe(false);
  });
  it("says plainly that it ends the next day", () => {
    expect(overnightMessage("15:00", "13:00")).toMatch(/runs overnight.*the next day/);
  });
});

describe("B2-04 past date ranges", () => {
  it("warns only when the end date is before today", () => {
    expect(isPastRange("2026-10-05", "2026-11-14")).toBe(true);
    expect(isPastRange("2026-11-14", "2026-11-14")).toBe(false);
    expect(isPastRange(null, "2026-11-14")).toBe(false);
  });
});

describe("B2-03 overlaps and who wins", () => {
  const breakfast = rule({ id: "b", name: "Breakfast", priority: 10, updatedAt: "2026-11-14T19:00:00Z" });
  const brunch = rule({ name: "Weekend brunch", weekdays: [6, 7], startTime: "09:00", endTime: "14:00" });
  it("finds the overlapping days and names the winner (QA repro)", () => {
    const found = findOverlaps(brunch, [breakfast], []);
    expect(found).toHaveLength(1);
    expect(found[0].days).toEqual([6, 7]);
    expect(found[0].winsHere).toBe(false);
    expect(found[0].message).toMatch(/“Breakfast” plays there instead because it has priority 10/);
  });
  it("ignores other screens, paused rules and disjoint dates", () => {
    expect(findOverlaps(brunch, [{ ...breakfast, displayId: "other" }], [])).toEqual([]);
    expect(findOverlaps(brunch, [{ ...breakfast, enabled: false }], [])).toEqual([]);
    expect(findOverlaps({ ...brunch, startsOn: "2026-12-01" }, [{ ...breakfast, endsOn: "2026-11-30" }], [])).toEqual([]);
  });
  it("counts a group rule that covers the screen", () => {
    const group = rule({ id: "g", name: "All TVs", displayId: null, groupId: "grp", priority: 50, updatedAt: "2026-11-14T19:00:00Z" });
    const found = findOverlaps(brunch, [group], [{ id: "grp", displayIds: ["tv"] }]);
    expect(found[0].winsHere).toBe(true);
    expect(found[0].message).toMatch(/a rule for one screen beats a group rule/);
  });
  it("handles windows that cross midnight and the Sunday→Monday wrap", () => {
    const late = rule({ name: "Late", weekdays: [7], startTime: "22:00", endTime: "02:00" });
    const early = rule({ name: "Early", weekdays: [1], startTime: "01:00", endTime: "03:00" });
    expect(overlapDays(late, early)).toEqual([1]);
  });
  it("agrees with the server's resolution order", () => {
    const cases: [Partial<RuleLike>, Partial<RuleLike>][] = [
      [{ id: "a", priority: 10, updatedAt: "2026-11-14T10:00:00Z" }, { id: "b", priority: 0, updatedAt: "2026-11-14T11:00:00Z" }],
      [{ id: "a", priority: 0, updatedAt: "2026-11-14T10:00:00Z" }, { id: "b", priority: 0, updatedAt: "2026-11-14T11:00:00Z" }],
      [{ id: "a", displayId: null, groupId: "g", priority: 99, updatedAt: "2026-11-14T10:00:00Z" }, { id: "b", priority: 0, updatedAt: "2026-11-14T10:00:00Z" }],
      [{ id: "a", priority: 0, updatedAt: "2026-11-14T10:00:00Z" }, { id: "b", priority: 0, updatedAt: "2026-11-14T10:00:00Z" }],
    ];
    const toServer = (r: RuleLike): ScheduleRule => ({ id: r.id!, name: r.name, playlistId: "p", target: r.displayId ? "display" : "group", weekdays: r.weekdays, startMinute: 0, endMinute: 60, startsOn: null, endsOn: null, priority: r.priority, updatedAt: r.updatedAt!, enabled: true });
    for (const [x, y] of cases) {
      const a = rule(x); const b = rule(y);
      const server = [toServer(a), toServer(b)].sort(compareRules)[0].id;
      expect(winner(a, b).rule.id).toBe(server);
    }
  });
});

describe("B2-01 / B2-05 wizard sources and defaults", () => {
  const menus = [
    { id: "m1", name: "QA Breakfast", playlistId: "p1" },
    { id: "m2", name: "QA Lunch", playlistId: null },
  ];
  const playlists = [
    { id: "p1", name: "QA Breakfast", publishedAt: "2026-11-14T19:39:00Z" },
    { id: "p9", name: "Mixed loop", publishedAt: "2026-11-14T19:39:00Z" },
    { id: "p8", name: "Draft loop", publishedAt: null },
  ];
  it("marks draft-only boards as not ready and lists each board once", () => {
    const s = dayPartSources(menus, playlists);
    expect(s.boards).toEqual([{ id: "m1", name: "QA Breakfast", ready: true }, { id: "m2", name: "QA Lunch", ready: false }]);
    expect(s.playlists.map((p) => p.id)).toEqual(["p9"]);
  });
  it("starts Dinner at 5 PM after Lunch and keeps the wizard priority", () => {
    expect(DAY_PARTS.find((p) => p.key === "dinner")?.start).toBe("17:00");
    expect(DAY_PARTS.find((p) => p.key === "lunch")?.end).toBe("16:00");
    expect(DAY_PART_PRIORITY).toBe(10);
  });
  it("replaces the misleading server message", () => {
    const route = readFileSync("app/api/schedules/day-parts/route.ts", "utf8");
    expect(route).toContain("Publish this board first");
    expect(route).not.toMatch(/playlist_id\) return fail\("Menu not found\."/);
  });
});

describe("U2-02 tick order", () => {
  it("keeps ticks in the order made", () => {
    let order: string[] = [];
    order = togglePicks(order, { c: true });
    order = togglePicks(order, { c: true, a: true });
    order = togglePicks(order, { c: true, a: true, b: true });
    expect(order).toEqual(["c", "a", "b"]);
    expect(togglePicks(order, { c: true, a: false, b: true })).toEqual(["c", "b"]);
  });
});

describe("U2-04 promo placeholders", () => {
  it("new promos start with bracketed placeholders that still validate", () => {
    for (const t of PROMO_TEMPLATES) {
      const content = samplePromo(t.id);
      expect(parsePromoContent(content).ok).toBe(true);
      expect(placeholderFields(content)).toContain("headline");
      expect(JSON.stringify(content)).not.toMatch(/Half-price|\$4"|Birria|\$9\.99/);
    }
  });
  it("real text is not flagged", () => {
    expect(placeholderFields({ ...samplePromo("deal"), headline: "2 tacos + horchata", subheadline: "x", price: "$9", footer: "" })).toEqual([]);
  });
});

describe("B2-08 reset link wording", () => {
  it("covers both used and expired links", () => {
    expect(friendlyAuthError("Email link is invalid or has expired")).toBe("This link has expired or was already used. Ask for a new one.");
  });
});
