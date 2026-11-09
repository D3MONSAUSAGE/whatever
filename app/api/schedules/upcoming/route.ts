import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isMissingSchema, SCHEDULES_UNAVAILABLE } from "@/lib/server/schema";
import { isValidTimeZone, ruleFromRow, scheduleNow, type ScheduleRule } from "@/lib/server/schedule";
import { upcomingAcrossScreens, type OverviewRule } from "@/lib/server/schedule-overview";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS = "id, name, playlist_id, display_id, group_id, weekdays, start_minute, end_minute, starts_on, ends_on, priority, updated_at, enabled";

/** Next 7 to 14 days for every screen, using buildTimeline. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const days = Number(new URL(req.url).searchParams.get("days") || "14");
  if (!Number.isInteger(days) || days < 7 || days > 14) return fail("Choose 7 to 14 days.", 400);

  const [displays, locations, schedules, members, playlists] = await Promise.all([
    db().from("displays").select("id, name, location_id, status").eq("account_id", admin.accountId).eq("status", "active"),
    db().from("locations").select("id, timezone").eq("account_id", admin.accountId),
    db().from("schedules").select(COLUMNS).eq("account_id", admin.accountId),
    db().from("screen_group_members").select("display_id, group_id").eq("account_id", admin.accountId),
    db().from("playlists").select("id, name").eq("account_id", admin.accountId),
  ]);
  if (displays.error || locations.error || schedules.error || members.error || playlists.error) {
    const missing = [displays.error, locations.error, schedules.error, members.error, playlists.error].some((error) => error && isMissingSchema(error));
    if (missing) return fail(SCHEDULES_UNAVAILABLE, 503);
    return fail("Couldn't load the upcoming schedule.", 500);
  }

  const zones = new Map((locations.data ?? []).map((row) => [String(row.id), String(row.timezone ?? "UTC")]));
  const groupsByDisplay = new Map<string, string[]>();
  for (const member of members.data ?? []) {
    const id = String(member.display_id);
    const list = groupsByDisplay.get(id) ?? [];
    list.push(String(member.group_id));
    groupsByDisplay.set(id, list);
  }
  const names = new Map((playlists.data ?? []).map((row) => [String(row.id), String(row.name ?? "")]));
  const rules: OverviewRule[] = (schedules.data ?? []).map((row) => {
    const rule = ruleFromRow(row) as ScheduleRule;
    return { ...rule, displayId: row.display_id ? String(row.display_id) : null, groupId: row.group_id ? String(row.group_id) : null };
  });
  const from = scheduleNow();
  const until = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  const screens = (displays.data ?? []).map((row) => {
    const zone = row.location_id ? zones.get(String(row.location_id)) : "";
    return {
      id: String(row.id),
      name: String(row.name),
      timeZone: zone && isValidTimeZone(zone) ? zone : "UTC",
      groupIds: groupsByDisplay.get(String(row.id)) ?? [],
    };
  });
  return json({
    days,
    from: from.toISOString(),
    until: until.toISOString(),
    items: upcomingAcrossScreens(screens, rules, names, from, until),
  });
}
