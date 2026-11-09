import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shiftClock, shiftWeekdays } from "@/lib/clock";
import { syncLine } from "@/lib/sync-line";
import { playbackVersion, resolveRule, type ScheduleRule } from "@/lib/server/schedule";

const LA = "America/Los_Angeles";

function rule(overrides: Partial<ScheduleRule> = {}): ScheduleRule {
  return {
    id: "rule-promo",
    name: "Evening promo",
    playlistId: "playlist-b",
    target: "display",
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    startMinute: 21 * 60 + 24,
    endMinute: 22 * 60,
    startsOn: null,
    endsOn: null,
    priority: 0,
    updatedAt: "2026-11-01T00:00:00.000Z",
    enabled: true,
    ...overrides,
  };
}

describe("acceptance fixes", () => {
  it("shows 05:24 UTC as 9:24 PM Pacific the evening before", () => {
    const moved = shiftClock("05:24", "UTC", LA, new Date("2026-11-09T18:00:00.000Z"));
    expect(moved).toEqual({ time: "21:24", dayDelta: -1 });
    expect(shiftClock("06:00", "UTC", LA, new Date("2026-11-09T18:00:00.000Z")).time).toBe("22:00");
    expect(shiftWeekdays([1, 2, 3, 4, 5, 6, 7], moved.dayDelta)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(shiftWeekdays([1], -1)).toEqual([7]);
  });

  it("switches to a different playlist at the start and back to the assignment at the end", () => {
    const assignment = "playlist-a";
    const promo = rule();
    const playing = (instant: string) => resolveRule([promo], new Date(instant), LA)?.playlistId ?? assignment;
    expect(playing("2026-11-09T05:23:00.000Z")).toBe(assignment);
    expect(playing("2026-11-09T05:24:00.000Z")).toBe("playlist-b");
    expect(playing("2026-11-09T05:59:00.000Z")).toBe("playlist-b");
    expect(playing("2026-11-09T06:00:00.000Z")).toBe(assignment);
    const on = resolveRule([promo], new Date("2026-11-09T05:24:00.000Z"), LA);
    expect(playbackVersion(4, on ? { id: on.id, playlistId: on.playlistId, revision: 2 } : null)).not.toBe(4);
    expect(playbackVersion(4, null)).toBe(4);
  });

  it("sends a schedule the published slides, not the unpublished draft", () => {
    const source = readFileSync("app/api/player/state/route.ts", "utf8");
    const fn = source.slice(source.indexOf("async function publishedPlaylistById"), source.indexOf("async function publishedPlaylist("));
    expect(fn).toContain('.eq("kind", "published")');
    expect(fn).not.toContain("draft");
    const gate = readFileSync("lib/server/schedule-target.ts", "utf8");
    expect(gate).toContain('.eq("kind", "published")');
    expect(gate).toContain("Screens play its published slides");
  });

  it("does not say a screen is playing while it is offline", () => {
    expect(syncLine({ reportedState: "playing", online: false, connected: true, playingAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() })).toMatch(/^Last reported playing .+ · TV offline$/);
    expect(syncLine({ reportedState: "playing", online: true, connected: true })).toBe("Playing on the TV");
    expect(syncLine({ reportedState: "acknowledged", online: false, connected: true })).toBe("TV has the update · TV offline");
    expect(syncLine({ reportedState: "unknown", online: false, connected: true })).toBe("Unknown · TV offline");
  });
});
