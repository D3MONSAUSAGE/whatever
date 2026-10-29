import { db } from "./supabase";
import { isMissingSchema } from "./schema";
import {
  isValidTimeZone,
  nextTransition,
  playbackVersion,
  resolveRule,
  ruleFromRow,
  scheduleNow,
  type ScheduleRule,
} from "./schedule";

export type PlaybackSchedule =
  | { kind: "off" }
  | { kind: "error" }
  | {
      kind: "on";
      version: number;
      overridePlaylistId: string | null;
      accountId: string;
      nextTransitionAt: string | null;
    };

type ScheduleRow = {
  id: string;
  name: string;
  playlist_id: string;
  display_id: string | null;
  group_id: string | null;
  weekdays: number[];
  start_minute: number;
  end_minute: number;
  starts_on: string | null;
  ends_on: string | null;
  priority: number;
  updated_at: string;
  enabled: boolean;
};

export type LoadedRules =
  | { kind: "missing" }
  | { kind: "absent" }
  | { kind: "error" }
  | { kind: "ready"; accountId: string; timeZone: string; rules: ScheduleRule[] };

const RULE_COLUMNS = "id, name, playlist_id, display_id, group_id, weekdays, start_minute, end_minute, starts_on, ends_on, priority, updated_at, enabled";

/** Rules that target this display, plus the location timezone. `missing` means migration 0004 is not applied. */
export async function loadRulesForDisplay(displayId: string, expectedAccountId?: string): Promise<LoadedRules> {
  const display = await db().from("displays").select("account_id, location_id, status").eq("id", displayId).maybeSingle();
  if (display.error) return { kind: "error" };
  if (!display.data || display.data.status === "revoked") return { kind: "absent" };
  const accountId = String(display.data.account_id);
  if (expectedAccountId && accountId !== expectedAccountId) return { kind: "absent" };

  const schedules = await db().from("schedules").select(RULE_COLUMNS).eq("account_id", accountId).eq("enabled", true);
  if (schedules.error) return isMissingSchema(schedules.error) ? { kind: "missing" } : { kind: "error" };

  const rows = (schedules.data ?? []) as ScheduleRow[];
  let groupIds = new Set<string>();
  if (rows.some((row) => row.group_id)) {
    const members = await db()
      .from("screen_group_members")
      .select("group_id")
      .eq("account_id", accountId)
      .eq("display_id", displayId);
    if (members.error) return isMissingSchema(members.error) ? { kind: "missing" } : { kind: "error" };
    groupIds = new Set((members.data ?? []).map((row) => String(row.group_id)));
  }
  const applicable = rows.filter((row) => row.display_id === displayId || (row.group_id != null && groupIds.has(String(row.group_id))));

  let timeZone = "UTC";
  const locationId = display.data.location_id ? String(display.data.location_id) : "";
  if (locationId) {
    const location = await db().from("locations").select("timezone").eq("id", locationId).maybeSingle();
    if (location.error) {
      if (!isMissingSchema(location.error)) return { kind: "error" };
    } else if (location.data?.timezone && isValidTimeZone(String(location.data.timezone))) {
      timeZone = String(location.data.timezone);
    }
  }
  return { kind: "ready", accountId, timeZone, rules: applicable.map((row) => ruleFromRow(row)) };
}

/**
 * What the TV should play on this poll. `off` means there is no schedule for
 * this screen (or the migration is not applied): the caller keeps today's
 * assignment response, including the content version. `on` means at least one
 * rule targets the screen. The version stays equal to content_version while
 * the default assignment is showing, and changes when a rule is active.
 */
export async function readPlaybackSchedule(displayId: string, contentVersion: number): Promise<PlaybackSchedule> {
  const loaded = await loadRulesForDisplay(displayId);
  if (loaded.kind === "error") return { kind: "error" };
  if (loaded.kind !== "ready" || loaded.rules.length === 0) return { kind: "off" };

  const { rules, timeZone, accountId } = loaded;
  const now = scheduleNow();
  const winner = resolveRule(rules, now, timeZone);
  let revision = 0;
  if (winner) {
    const playlist = await db().from("playlists").select("revision").eq("id", winner.playlistId).eq("account_id", accountId).maybeSingle();
    if (playlist.error) return isMissingSchema(playlist.error) ? { kind: "off" } : { kind: "error" };
    revision = Number(playlist.data?.revision ?? 0);
  }
  const next = nextTransition(rules, now, timeZone);
  return {
    kind: "on",
    version: playbackVersion(contentVersion, winner ? { id: winner.id, playlistId: winner.playlistId, revision } : null),
    overridePlaylistId: winner?.playlistId ?? null,
    accountId,
    nextTransitionAt: next ? next.toISOString() : null,
  };
}
