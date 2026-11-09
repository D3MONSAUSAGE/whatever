import { describe, expect, it } from "vitest";
import { publicAppOrigin, publicUrls } from "@/lib/public-url";
import { safeDashboardNext } from "@/lib/safe-next";
import { nextChange, type ScheduleRule } from "@/lib/server/schedule";
import { publishImpact, type PublishScreen } from "@/lib/server/screen-publish";
import { playbackReport } from "@/lib/server/playback-report";
import { screenNameWarning } from "@/lib/screen-names";

const rule = (patch: Partial<ScheduleRule>): ScheduleRule => ({
  id: "00000000-0000-4000-8000-000000000010",
  name: "Lunch",
  playlistId: "00000000-0000-4000-8000-000000000011",
  target: "display",
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  startMinute: 12 * 60,
  endMinute: 14 * 60,
  startsOn: null,
  endsOn: null,
  priority: 0,
  updatedAt: "2026-11-01T00:00:00.000Z",
  enabled: true,
  ...patch,
});

describe("screen contract helpers", () => {
  it("keeps the studio deep link through sign-in", () => {
    const next = "/dashboard/media/layout-studio?screen=00000000-0000-4000-8000-000000000001";
    expect(safeDashboardNext(next)).toBe(next);
    expect(safeDashboardNext("https://evil.example/dashboard")).toBe("/dashboard");
  });

  it("never advertises a Vercel hostname", () => {
    expect(publicAppOrigin({ NEXT_PUBLIC_APP_URL: "https://pantalla-chi.vercel.app" } as unknown as NodeJS.ProcessEnv)).toBe("https://pekkotv.com");
    expect(publicUrls({ PUBLIC_APP_URL: "https://pekkotv.com" } as unknown as NodeJS.ProcessEnv)).toEqual({
      appUrl: "https://pekkotv.com",
      pairUrl: "https://pekkotv.com/pair",
      tvUrl: "https://pekkotv.com/tv",
    });
  });

  it("uses one next-change calculation", () => {
    const before = nextChange([rule({})], new Date("2026-11-09T15:00:00.000Z"), "UTC");
    expect(before?.kind).toBe("schedule");
    expect(before?.label).toBe("Lunch");
    const during = nextChange([rule({})], new Date("2026-11-09T12:30:00.000Z"), "UTC");
    expect(during?.kind).toBe("assignment");
    expect(during?.label).toBe("Assigned content");
  });

  it("warns on the same name and suggests a free one", () => {
    const existing = ["Gother QA Test Screen", "Gother QA Test Screen"];
    expect(screenNameWarning("Gother QA Test Screen 2", existing)).toBeNull();
    const warning = screenNameWarning("  gother   qa test screen ", existing);
    expect(warning?.suggestedName).toBe("Gother QA Test Screen 2");
    expect(warning?.nameWarning).toContain("already named");
  });

  it("moves a screen from assigned to playing when the TV reports the version", () => {
    expect(playbackReport({ content_version: 3, hasAssignment: true }).reportedState).toBe("assigned");
    expect(playbackReport({
      content_version: 3, acknowledged_version: 3, acknowledged_at: "2026-11-09T04:00:00.000Z", hasAssignment: true,
    }).reportedState).toBe("acknowledged");
    expect(playbackReport({
      content_version: 3, confirmed_version: 3, confirmed_at: "2026-11-09T04:00:05.000Z", hasAssignment: true,
    }).reportedState).toBe("playing");
  });

  it("previews who changes and who is left alone", () => {
    const selected: PublishScreen[] = [
      { id: "a", name: "Counter", playlistId: null, online: true, scheduleName: "Lunch", scheduleTarget: "display" },
      { id: "b", name: "Patio", playlistId: "playlist", online: false, scheduleName: null, scheduleTarget: null },
    ];
    const others: PublishScreen[] = [
      { id: "c", name: "Bar", playlistId: "playlist", online: true, scheduleName: null, scheduleTarget: null },
      { id: "d", name: "Office", playlistId: "other", online: true, scheduleName: null, scheduleTarget: null },
    ];
    const impact = publishImpact("playlist", selected, others);
    expect(impact.affected).toEqual([{ id: "a", name: "Counter", change: "assign" }]);
    expect(impact.willBeCleared.map((item) => item.id)).toEqual(["c"]);
    expect(impact.kept.map((item) => item.id)).toEqual(["d"]);
    expect(impact.overriddenBySchedule.map((item) => item.id)).toEqual(["a"]);
    expect(impact.offline.map((item) => item.id)).toEqual(["b"]);
  });
});
