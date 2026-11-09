import { describe, expect, it } from "vitest";
import { upcomingAcrossScreens, type OverviewRule } from "@/lib/server/schedule-overview";
import type { ScheduleRule } from "@/lib/server/schedule";

function rule(overrides: Partial<OverviewRule> = {}): OverviewRule {
  const base: ScheduleRule = {
    id: "rule-lunch",
    name: "Weekday lunch",
    playlistId: "playlist-lunch",
    target: "display",
    weekdays: [3],
    startMinute: 11 * 60,
    endMinute: 14 * 60,
    startsOn: null,
    endsOn: null,
    priority: 0,
    updatedAt: "2026-10-01T00:00:00.000Z",
    enabled: true,
  };
  return { ...base, displayId: "front", groupId: null, ...overrides };
}

describe("upcoming across screens", () => {
  it("uses the same timeline for a screen rule and leaves other screens on their assignment", () => {
    const names = new Map([["playlist-lunch", "Lunch specials"]]);
    const from = new Date("2026-10-28T15:00:00.000Z");
    const until = new Date("2026-10-29T15:00:00.000Z");
    const items = upcomingAcrossScreens([
      { id: "front", name: "Front counter", timeZone: "America/Los_Angeles", groupIds: [] },
      { id: "patio", name: "Patio", timeZone: "America/Los_Angeles", groupIds: [] },
    ], [rule()], names, from, until);
    expect(items.map((item) => item.screen)).toEqual(["Front counter"]);
    expect(items[0]).toMatchObject({
      scheduleName: "Weekday lunch",
      playlistName: "Lunch specials",
      date: "2026-10-28",
      target: "display",
    });
    expect(new Date(items[0].start).toISOString()).toBe("2026-10-28T18:00:00.000Z");
    expect(new Date(items[0].end).toISOString()).toBe("2026-10-28T21:00:00.000Z");
  });

  it("includes a group rule on each member screen", () => {
    const names = new Map([["playlist-lunch", "Lunch specials"]]);
    const items = upcomingAcrossScreens([
      { id: "front", name: "Front counter", timeZone: "America/Los_Angeles", groupIds: ["floor"] },
      { id: "bar", name: "Bar", timeZone: "America/Los_Angeles", groupIds: [] },
    ], [rule({ id: "rule-group", target: "group", displayId: null, groupId: "floor" })], names, new Date("2026-10-28T15:00:00.000Z"), new Date("2026-10-29T15:00:00.000Z"));
    expect(items.map((item) => item.screen)).toEqual(["Front counter"]);
    expect(items[0].target).toBe("group");
  });
});
