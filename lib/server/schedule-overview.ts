import { buildTimeline, type ScheduleRule, type ScheduleTarget } from "@/lib/server/schedule";

export type OverviewRule = ScheduleRule & { displayId: string | null; groupId: string | null };

export type UpcomingItem = {
  displayId: string;
  screen: string;
  timezone: string;
  start: string;
  end: string;
  date: string;
  scheduleId: string;
  scheduleName: string;
  playlistName: string;
  target: ScheduleTarget;
};

export type ScreenClock = { id: string; name: string; timeZone: string; groupIds: string[] };

/** Rules for one screen, the same match the player uses: its own rules plus its groups. */
export function rulesForScreen(screen: ScreenClock, rules: OverviewRule[]): ScheduleRule[] {
  const groups = new Set(screen.groupIds);
  return rules.filter((rule) => rule.enabled && (rule.displayId === screen.id || (rule.groupId != null && groups.has(rule.groupId))));
}

/** Schedule windows across every screen for [from, until), from buildTimeline. */
export function upcomingAcrossScreens(screens: ScreenClock[], rules: OverviewRule[], playlistNames: Map<string, string>, from: Date, until: Date): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  for (const screen of screens) {
    const applicable = rulesForScreen(screen, rules);
    const byId = new Map(applicable.map((rule) => [rule.id, rule]));
    for (const segment of buildTimeline(applicable, from, until, screen.timeZone)) {
      if (!segment.ruleId) continue;
      const rule = byId.get(segment.ruleId);
      if (!rule) continue;
      items.push({
        displayId: screen.id,
        screen: screen.name,
        timezone: screen.timeZone,
        start: segment.start,
        end: segment.end,
        date: segment.date,
        scheduleId: rule.id,
        scheduleName: rule.name,
        playlistName: playlistNames.get(rule.playlistId) ?? "",
        target: rule.target,
      });
    }
  }
  items.sort((a, b) => a.start.localeCompare(b.start) || a.screen.localeCompare(b.screen));
  return items;
}
