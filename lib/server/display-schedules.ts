import { db } from "./supabase";
import { isMissingSchema } from "./schema";
import { compareRules, isValidTimeZone, nextTransition, ruleFromRow, ruleMatches, scheduleNow, type ScheduleRule } from "./schedule";

export type ScheduleSummary = {
  id: string;
  name: string;
  playlistId: string;
  playlistName: string;
  target: "display" | "group";
  priority: number;
};

export type DisplaySchedules = {
  /** Every enabled rule matching right now, winner first. */
  activeSchedules: ScheduleSummary[];
  /** The winning rule, or null when the saved assignment plays. `until` is the next change, if within 8 days. */
  currentSchedule: (ScheduleSummary & { until: string | null }) | null;
};

const COLUMNS = "id, name, playlist_id, display_id, group_id, weekdays, start_minute, end_minute, starts_on, ends_on, priority, updated_at, enabled";

/**
 * Batch version of the player's resolution, for GET /api/displays. Same rules,
 * same order (lib/server/schedule.ts). Returns an empty map when migration
 * 0004 is missing and null on a database error.
 */
export async function loadDisplaySchedules(
  accountId: string,
  displays: { id: string; timeZone: string | null }[],
): Promise<Map<string, DisplaySchedules> | null> {
  const out = new Map<string, DisplaySchedules>();
  if (!displays.length) return out;
  const schedules = await db().from("schedules").select(COLUMNS).eq("account_id", accountId).eq("enabled", true);
  if (schedules.error) return isMissingSchema(schedules.error) ? out : null;
  const rows = (schedules.data ?? []) as Parameters<typeof ruleFromRow>[0][] as (Parameters<typeof ruleFromRow>[0] & { display_id: string | null; group_id: string | null })[];
  if (!rows.length) {
    for (const display of displays) out.set(display.id, { activeSchedules: [], currentSchedule: null });
    return out;
  }

  const groupsByDisplay = new Map<string, Set<string>>();
  if (rows.some((row) => row.group_id)) {
    const members = await db().from("screen_group_members").select("group_id, display_id").eq("account_id", accountId);
    if (members.error) return isMissingSchema(members.error) ? out : null;
    for (const member of members.data ?? []) {
      const key = String(member.display_id);
      if (!groupsByDisplay.has(key)) groupsByDisplay.set(key, new Set());
      groupsByDisplay.get(key)!.add(String(member.group_id));
    }
  }

  const playlistIds = [...new Set(rows.map((row) => row.playlist_id))];
  const names = new Map<string, string>();
  const lists = await db().from("playlists").select("id, name").eq("account_id", accountId).in("id", playlistIds);
  if (lists.error && !isMissingSchema(lists.error)) return null;
  for (const list of lists.data ?? []) names.set(String(list.id), String(list.name));

  const now = scheduleNow();
  const summary = (rule: ScheduleRule): ScheduleSummary => ({
    id: rule.id,
    name: rule.name,
    playlistId: rule.playlistId,
    playlistName: names.get(rule.playlistId) ?? "",
    target: rule.target,
    priority: rule.priority,
  });
  for (const display of displays) {
    const groups = groupsByDisplay.get(display.id) ?? new Set<string>();
    const rules = rows
      .filter((row) => row.display_id === display.id || (row.group_id != null && groups.has(String(row.group_id))))
      .map(ruleFromRow);
    const timeZone = display.timeZone && isValidTimeZone(display.timeZone) ? display.timeZone : "UTC";
    const active = rules.filter((rule) => ruleMatches(rule, now, timeZone)).sort(compareRules);
    const winner = active[0];
    out.set(display.id, {
      activeSchedules: active.map(summary),
      currentSchedule: winner
        ? { ...summary(winner), until: nextTransition(rules, now, timeZone)?.toISOString() ?? null }
        : null,
    });
  }
  return out;
}
