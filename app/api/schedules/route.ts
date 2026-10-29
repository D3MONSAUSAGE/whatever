import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isMissingSchema, SCHEDULES_UNAVAILABLE } from "@/lib/server/schema";
import { formatMinute, parseScheduleBody } from "@/lib/server/schedule";
import { assertTarget } from "@/lib/server/schedule-target";
import { fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SCHEDULES = 200;

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const schedules = await db()
    .from("schedules")
    .select("id, name, playlist_id, display_id, group_id, weekdays, start_minute, end_minute, starts_on, ends_on, priority, enabled, updated_at")
    .eq("account_id", admin.accountId)
    .order("updated_at", { ascending: false });
  if (schedules.error) {
    if (isMissingSchema(schedules.error)) return fail(SCHEDULES_UNAVAILABLE, 503);
    return fail("Couldn't load schedules.", 500);
  }
  const rows = schedules.data ?? [];
  const playlistIds = [...new Set(rows.map((row) => String(row.playlist_id)))];
  const displayIds = [...new Set(rows.map((row) => row.display_id).filter(Boolean))] as string[];
  const groupIds = [...new Set(rows.map((row) => row.group_id).filter(Boolean))] as string[];
  const names = await namesFor(admin.accountId, playlistIds, displayIds, groupIds);
  if (names === "error") return fail("Couldn't load schedules.", 500);
  return json(rows.map((row) => ({
    id: row.id,
    name: row.name,
    playlistId: row.playlist_id,
    playlistName: names.playlists.get(String(row.playlist_id)) ?? "",
    displayId: row.display_id,
    displayName: row.display_id ? names.displays.get(String(row.display_id)) ?? "" : null,
    groupId: row.group_id,
    groupName: row.group_id ? names.groups.get(String(row.group_id)) ?? "" : null,
    weekdays: row.weekdays,
    startTime: formatMinute(Number(row.start_minute)),
    endTime: formatMinute(Number(row.end_minute)),
    startsOn: row.starts_on ? String(row.starts_on).slice(0, 10) : null,
    endsOn: row.ends_on ? String(row.ends_on).slice(0, 10) : null,
    priority: row.priority,
    enabled: row.enabled,
    updatedAt: row.updated_at,
  })));
}

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const parsed = parseScheduleBody(await readJson(req));
  if (!parsed.ok) return fail(parsed.error, 400);

  const count = await db().from("schedules").select("id").eq("account_id", admin.accountId);
  if (count.error) {
    if (isMissingSchema(count.error)) return fail(SCHEDULES_UNAVAILABLE, 503);
    return fail("Couldn't add the schedule.", 500);
  }
  if ((count.data ?? []).length >= MAX_SCHEDULES) return fail("This account already has 200 schedules.", 400);

  const target = await assertTarget(admin.accountId, parsed.value.playlistId, parsed.value.displayId, parsed.value.groupId);
  if (target) return fail(target.error, target.status);

  const now = new Date().toISOString();
  const inserted = await db().from("schedules").insert({
    account_id: admin.accountId,
    name: parsed.value.name,
    playlist_id: parsed.value.playlistId,
    display_id: parsed.value.displayId,
    group_id: parsed.value.groupId,
    weekdays: parsed.value.weekdays,
    start_minute: parsed.value.startMinute,
    end_minute: parsed.value.endMinute,
    starts_on: parsed.value.startsOn,
    ends_on: parsed.value.endsOn,
    priority: parsed.value.priority,
    enabled: parsed.value.enabled,
    updated_at: now,
  }).select("id").single();
  if (inserted.error) {
    if (isMissingSchema(inserted.error)) return fail(SCHEDULES_UNAVAILABLE, 503);
    return fail("Couldn't add the schedule.", 500);
  }
  return json({ id: inserted.data.id }, 201);
}

async function namesFor(accountId: string, playlistIds: string[], displayIds: string[], groupIds: string[]) {
  const playlists = new Map<string, string>();
  const displays = new Map<string, string>();
  const groups = new Map<string, string>();
  if (playlistIds.length) {
    const rows = await db().from("playlists").select("id, name").eq("account_id", accountId).in("id", playlistIds);
    if (rows.error) return "error" as const;
    for (const row of rows.data ?? []) playlists.set(String(row.id), String(row.name));
  }
  if (displayIds.length) {
    const rows = await db().from("displays").select("id, name").eq("account_id", accountId).in("id", displayIds);
    if (rows.error) return "error" as const;
    for (const row of rows.data ?? []) displays.set(String(row.id), String(row.name));
  }
  if (groupIds.length) {
    const rows = await db().from("screen_groups").select("id, name").eq("account_id", accountId).in("id", groupIds);
    if (rows.error) return "error" as const;
    for (const row of rows.data ?? []) groups.set(String(row.id), String(row.name));
  }
  return { playlists, displays, groups };
}
