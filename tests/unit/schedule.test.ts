import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  instantsForLocal,
  isValidTimeZone,
  localParts,
  nextTransition,
  parseClock,
  parseIsoDate,
  parseWeekdays,
  playbackVersion,
  resolveRule,
  ruleMatches,
  type ScheduleRule,
} from "@/lib/server/schedule";

const LA = "America/Los_Angeles";

function rule(overrides: Partial<ScheduleRule> = {}): ScheduleRule {
  return {
    id: "rule-lunch",
    name: "Lunch",
    playlistId: "playlist-lunch",
    target: "display",
    weekdays: [1, 2, 3, 4, 5],
    startMinute: 11 * 60,
    endMinute: 14 * 60,
    startsOn: null,
    endsOn: null,
    priority: 0,
    updatedAt: "2026-10-01T00:00:00.000Z",
    enabled: true,
    ...overrides,
  };
}

describe("schedule resolution", () => {
  it("accepts IANA names and rejects inventions", () => {
    expect(isValidTimeZone("America/Los_Angeles")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("plays weekdays 11:00-14:00 in the location timezone and falls back outside it", () => {
    const lunch = rule();
    // Wednesday 28 Oct 2026, 11:00 PDT.
    expect(ruleMatches(lunch, new Date("2026-10-28T18:00:00.000Z"), LA)).toBe(true);
    expect(localParts(new Date("2026-10-28T17:59:00.000Z"), LA).hour).toBe(10);
    expect(ruleMatches(lunch, new Date("2026-10-28T17:59:00.000Z"), LA)).toBe(false);
    // 14:00 PDT is the exclusive end.
    expect(ruleMatches(lunch, new Date("2026-10-28T21:00:00.000Z"), LA)).toBe(false);
    expect(ruleMatches(lunch, new Date("2026-10-28T20:59:00.000Z"), LA)).toBe(true);
    // Saturday.
    expect(ruleMatches(lunch, new Date("2026-10-31T18:00:00.000Z"), LA)).toBe(false);
    expect(resolveRule([lunch], new Date("2026-10-28T18:00:00.000Z"), LA)?.id).toBe("rule-lunch");
    expect(resolveRule([lunch], new Date("2026-10-28T22:00:00.000Z"), LA)).toBeNull();
  });

  it("keeps a 30-minute offset zone on local clock time", () => {
    const lunch = rule();
    // Wednesday 11:00 in Asia/Kolkata is 05:30 UTC.
    expect(ruleMatches(lunch, new Date("2026-10-28T05:30:00.000Z"), "Asia/Kolkata")).toBe(true);
    expect(ruleMatches(lunch, new Date("2026-10-28T05:29:00.000Z"), "Asia/Kolkata")).toBe(false);
  });

  it("lets a midnight-spanning window continue into the next morning", () => {
    const late = rule({
      id: "rule-late",
      weekdays: [5],
      startMinute: 22 * 60,
      endMinute: 2 * 60,
    });
    // Friday 30 Oct 2026 22:30 PDT.
    expect(localParts(new Date("2026-10-31T05:30:00.000Z"), LA)).toMatchObject({ weekday: 5, hour: 22, minute: 30 });
    expect(ruleMatches(late, new Date("2026-10-31T05:30:00.000Z"), LA)).toBe(true);
    // Saturday 01:30 PDT still belongs to Friday's window.
    expect(localParts(new Date("2026-10-31T08:30:00.000Z"), LA)).toMatchObject({ weekday: 6, hour: 1, minute: 30 });
    expect(ruleMatches(late, new Date("2026-10-31T08:30:00.000Z"), LA)).toBe(true);
    // Saturday 02:00 is the exclusive end. Saturday night does not start a new window.
    expect(ruleMatches(late, new Date("2026-10-31T09:00:00.000Z"), LA)).toBe(false);
    expect(ruleMatches(late, new Date("2026-11-01T05:30:00.000Z"), LA)).toBe(false);
    // Monday 01:30 is the tail of Sunday, which is not selected.
    const weeknights = rule({ id: "rule-nights", weekdays: [1, 2, 3, 4, 5], startMinute: 22 * 60, endMinute: 2 * 60 });
    expect(localParts(new Date("2026-10-26T08:30:00.000Z"), LA)).toMatchObject({ weekday: 1, hour: 1 });
    expect(ruleMatches(weeknights, new Date("2026-10-26T08:30:00.000Z"), LA)).toBe(false);
    expect(ruleMatches(weeknights, new Date("2026-10-27T05:30:00.000Z"), LA)).toBe(true);
  });

  it("applies the date range to the day the window started", () => {
    const ranged = rule({
      weekdays: [5],
      startMinute: 22 * 60,
      endMinute: 2 * 60,
      startsOn: "2026-10-30",
      endsOn: "2026-10-30",
    });
    expect(ruleMatches(ranged, new Date("2026-10-31T05:30:00.000Z"), LA)).toBe(true);
    expect(ruleMatches(ranged, new Date("2026-10-31T08:30:00.000Z"), LA)).toBe(true);
    expect(ruleMatches(ranged, new Date("2026-11-07T05:30:00.000Z"), LA)).toBe(false);
    const startsSaturday = rule({
      weekdays: [5, 6],
      startMinute: 22 * 60,
      endMinute: 2 * 60,
      startsOn: "2026-10-31",
    });
    expect(ruleMatches(startsSaturday, new Date("2026-10-31T08:30:00.000Z"), LA)).toBe(false);
    expect(ruleMatches(startsSaturday, new Date("2026-11-01T05:30:00.000Z"), LA)).toBe(true);
  });

  it("follows America/Los_Angeles across the fall-back week and the spring-forward week", () => {
    const lunch = rule();
    // Friday 30 Oct 2026 is still PDT. Monday 2 Nov 2026 is PST. 11:00 local is a different UTC hour.
    expect(localParts(new Date("2026-10-30T18:00:00.000Z"), LA)).toMatchObject({ weekday: 5, hour: 11 });
    expect(ruleMatches(lunch, new Date("2026-10-30T18:00:00.000Z"), LA)).toBe(true);
    expect(localParts(new Date("2026-11-02T18:00:00.000Z"), LA)).toMatchObject({ weekday: 1, hour: 10 });
    expect(ruleMatches(lunch, new Date("2026-11-02T18:00:00.000Z"), LA)).toBe(false);
    expect(localParts(new Date("2026-11-02T19:00:00.000Z"), LA)).toMatchObject({ weekday: 1, hour: 11 });
    expect(ruleMatches(lunch, new Date("2026-11-02T19:00:00.000Z"), LA)).toBe(true);
    expect(ruleMatches(lunch, new Date("2026-11-02T22:00:00.000Z"), LA)).toBe(false);

    // Friday 6 Mar 2026 is PST. Monday 9 Mar 2026 is PDT.
    expect(localParts(new Date("2026-03-06T19:00:00.000Z"), LA)).toMatchObject({ weekday: 5, hour: 11 });
    expect(ruleMatches(lunch, new Date("2026-03-06T19:00:00.000Z"), LA)).toBe(true);
    expect(localParts(new Date("2026-03-09T18:00:00.000Z"), LA)).toMatchObject({ weekday: 1, hour: 11 });
    expect(ruleMatches(lunch, new Date("2026-03-09T18:00:00.000Z"), LA)).toBe(true);
    expect(ruleMatches(lunch, new Date("2026-03-09T19:00:00.000Z"), LA)).toBe(true);
    expect(localParts(new Date("2026-03-09T21:00:00.000Z"), LA)).toMatchObject({ hour: 14 });
    expect(ruleMatches(lunch, new Date("2026-03-09T21:00:00.000Z"), LA)).toBe(false);
  });

  it("skips the spring-forward gap and stays active on both sides when the window covers it", () => {
    const gapOnly = rule({ id: "gap", weekdays: [7], startMinute: 2 * 60 + 15, endMinute: 2 * 60 + 45 });
    const from = Date.parse("2026-03-08T08:00:00.000Z");
    const until = Date.parse("2026-03-08T12:00:00.000Z");
    for (let instant = from; instant < until; instant += 60_000) {
      expect(ruleMatches(gapOnly, new Date(instant), LA)).toBe(false);
    }
    expect(instantsForLocal(2026, 3, 8, 2, 30, LA)).toEqual([]);

    const covers = rule({ id: "covers", weekdays: [7], startMinute: 1 * 60 + 30, endMinute: 3 * 60 + 30 });
    expect(localParts(new Date("2026-03-08T09:45:00.000Z"), LA)).toMatchObject({ hour: 1, minute: 45 });
    expect(ruleMatches(covers, new Date("2026-03-08T09:45:00.000Z"), LA)).toBe(true);
    expect(localParts(new Date("2026-03-08T10:00:00.000Z"), LA)).toMatchObject({ hour: 3, minute: 0 });
    expect(ruleMatches(covers, new Date("2026-03-08T10:00:00.000Z"), LA)).toBe(true);
    expect(ruleMatches(covers, new Date("2026-03-08T10:15:00.000Z"), LA)).toBe(true);
    expect(ruleMatches(covers, new Date("2026-03-08T10:30:00.000Z"), LA)).toBe(false);

    const stopsInGap = rule({ id: "stops", weekdays: [7], startMinute: 1 * 60 + 30, endMinute: 2 * 60 + 30 });
    expect(ruleMatches(stopsInGap, new Date("2026-03-08T09:40:00.000Z"), LA)).toBe(true);
    expect(ruleMatches(stopsInGap, new Date("2026-03-08T10:00:00.000Z"), LA)).toBe(false);
    expect(nextTransition([stopsInGap], new Date("2026-03-08T09:40:00.000Z"), LA)?.toISOString()).toBe("2026-03-08T10:00:00.000Z");
  });

  it("matches both occurrences of a fall-back hour", () => {
    const repeated = rule({ id: "repeat", weekdays: [7], startMinute: 1 * 60 + 15, endMinute: 1 * 60 + 45 });
    expect(instantsForLocal(2026, 11, 1, 1, 30, LA)).toEqual([
      Date.parse("2026-11-01T08:30:00.000Z"),
      Date.parse("2026-11-01T09:30:00.000Z"),
    ]);
    expect(ruleMatches(repeated, new Date("2026-11-01T08:20:00.000Z"), LA)).toBe(true);
    expect(ruleMatches(repeated, new Date("2026-11-01T08:50:00.000Z"), LA)).toBe(false);
    expect(ruleMatches(repeated, new Date("2026-11-01T09:20:00.000Z"), LA)).toBe(true);
    expect(ruleMatches(repeated, new Date("2026-11-01T09:50:00.000Z"), LA)).toBe(false);
    expect(nextTransition([repeated], new Date("2026-11-01T08:20:00.000Z"), LA)?.toISOString()).toBe("2026-11-01T08:45:00.000Z");
    expect(nextTransition([repeated], new Date("2026-11-01T08:50:00.000Z"), LA)?.toISOString()).toBe("2026-11-01T09:15:00.000Z");
    expect(nextTransition([repeated], new Date("2026-11-01T09:20:00.000Z"), LA)?.toISOString()).toBe("2026-11-01T09:45:00.000Z");
  });

  it("resolves conflicts by display, then priority, then recency, then id", () => {
    const at = new Date("2026-10-28T18:30:00.000Z");
    const displayLow = rule({ id: "display-low", target: "display", priority: 0, updatedAt: "2026-10-01T00:00:00.000Z" });
    const groupHigh = rule({
      id: "group-high",
      target: "group",
      priority: 100,
      updatedAt: "2026-10-20T00:00:00.000Z",
      playlistId: "playlist-group",
    });
    expect(resolveRule([groupHigh, displayLow], at, LA)?.id).toBe("display-low");

    const older = rule({ id: "older", priority: 5, updatedAt: "2026-01-01T00:00:00.000Z", playlistId: "playlist-a" });
    const newer = rule({ id: "newer", priority: 1, updatedAt: "2026-10-20T00:00:00.000Z", playlistId: "playlist-b" });
    expect(resolveRule([newer, older], at, LA)?.id).toBe("older");

    const first = rule({ id: "aaa", priority: 2, updatedAt: "2026-10-01T00:00:00.000Z" });
    const second = rule({ id: "zzz", priority: 2, updatedAt: "2026-10-02T00:00:00.000Z", playlistId: "playlist-new" });
    expect(resolveRule([first, second], at, LA)?.id).toBe("zzz");

    const lowId = rule({ id: "aaa-id", priority: 3, updatedAt: "2026-10-05T00:00:00.000Z" });
    const highId = rule({ id: "zzz-id", priority: 3, updatedAt: "2026-10-05T00:00:00.000Z", playlistId: "playlist-other" });
    expect(resolveRule([highId, lowId], at, LA)?.id).toBe("aaa-id");

    const disabled = rule({ id: "off", enabled: false, priority: 99 });
    expect(resolveRule([disabled], at, LA)).toBeNull();
  });

  it("uses the content version for the default and a stable distinct version while a rule is active", () => {
    expect(playbackVersion(4, null)).toBe(4);
    const active = { id: "rule-lunch", playlistId: "playlist-lunch", revision: 3 };
    const version = playbackVersion(4, active);
    expect(version).toBe(playbackVersion(4, active));
    expect(version).not.toBe(4);
    expect(version).toBeGreaterThan(1_000_000_000_000);
    expect(playbackVersion(4, { ...active, revision: 4 })).not.toBe(version);
    expect(playbackVersion(4, { ...active, id: "rule-other" })).not.toBe(version);
    expect(Number.isSafeInteger(version)).toBe(true);
  });

  it("builds a 7-day timeline with the default filling the gaps", () => {
    const lunch = rule();
    const from = new Date("2026-10-26T07:00:00.000Z"); // Monday 00:00 PDT
    const until = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    const segments = buildTimeline([lunch], from, until, LA);
    const at = (iso: string) => segments.find((segment) => segment.start <= iso && iso < segment.end);
    const wednesdayLunch = at("2026-10-28T18:30:00.000Z");
    expect(wednesdayLunch?.ruleId).toBe("rule-lunch");
    expect(wednesdayLunch?.date).toBe("2026-10-28");
    expect(at("2026-10-28T17:30:00.000Z")?.ruleId).toBeNull();
    expect(at("2026-11-01T18:00:00.000Z")?.ruleId).toBeNull(); // Sunday 10:00 PST, after the fall-back
    const edges = nextTransition([lunch], new Date("2026-10-28T17:00:00.000Z"), LA);
    expect(edges?.toISOString()).toBe("2026-10-28T18:00:00.000Z");
    expect(nextTransition([lunch], new Date("2026-10-28T18:30:00.000Z"), LA)?.toISOString()).toBe("2026-10-28T21:00:00.000Z");
  });

  it("rejects clocks, dates, and weekdays that are not a window", () => {
    expect(parseClock("11:00", false)).toBe(11 * 60);
    expect(parseClock("24:00", true)).toBe(1440);
    expect(parseClock("24:00", false)).toBeNull();
    expect(parseClock("11:60", false)).toBeNull();
    expect(parseClock("9:00", false)).toBeNull();
    expect(parseWeekdays([1, 5, 5, 7])).toEqual([1, 5, 7]);
    expect(parseWeekdays([])).toBeNull();
    expect(parseWeekdays([0])).toBeNull();
    expect(parseIsoDate("2026-11-01")).toBe("2026-11-01");
    expect(parseIsoDate("2026-02-31")).toBe("invalid");
    expect(parseIsoDate(null)).toBeNull();
  });
});
