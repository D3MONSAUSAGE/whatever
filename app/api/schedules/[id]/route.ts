import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { isMissingSchema, SCHEDULES_UNAVAILABLE } from "@/lib/server/schema";
import { parseScheduleBody, type ScheduleDraft } from "@/lib/server/schedule";
import { fail, json, readJson } from "@/lib/server/http";
import { assertTarget } from "@/lib/server/schedule-target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Schedule not found.", 404);
  const current = await db()
    .from("schedules")
    .select("id, name, playlist_id, display_id, group_id, weekdays, start_minute, end_minute, starts_on, ends_on, priority, enabled")
    .eq("id", id)
    .eq("account_id", admin.accountId)
    .maybeSingle();
  if (current.error) {
    if (isMissingSchema(current.error)) return fail(SCHEDULES_UNAVAILABLE, 503);
    return fail("Couldn't update the schedule.", 500);
  }
  if (!current.data) return fail("Schedule not found.", 404);

  const row = current.data;
  const body = await readJson(req);
  const merged = parseScheduleBody({
    name: "name" in body ? body.name : row.name,
    playlistId: "playlistId" in body ? body.playlistId : row.playlist_id,
    displayId: "displayId" in body || "groupId" in body ? body.displayId ?? null : row.display_id,
    groupId: "displayId" in body || "groupId" in body ? body.groupId ?? null : row.group_id,
    weekdays: "weekdays" in body ? body.weekdays : asNumbers(row.weekdays),
    startTime: "startTime" in body ? body.startTime : minutes(row.start_minute),
    endTime: "endTime" in body ? body.endTime : minutes(row.end_minute),
    startsOn: "startsOn" in body ? body.startsOn : row.starts_on,
    endsOn: "endsOn" in body ? body.endsOn : row.ends_on,
    priority: "priority" in body ? body.priority : row.priority,
    enabled: "enabled" in body ? body.enabled : row.enabled,
  });
  if (!merged.ok) return fail(merged.error, 400);
  const saved = await writeSchedule(admin.accountId, id, merged.value);
  if (saved) return saved;
  return json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Schedule not found.", 404);
  const deleted = await db().from("schedules").delete().eq("id", id).eq("account_id", admin.accountId).select("id");
  if (deleted.error) {
    if (isMissingSchema(deleted.error)) return fail(SCHEDULES_UNAVAILABLE, 503);
    return fail("Couldn't delete the schedule.", 500);
  }
  if (!(deleted.data ?? []).length) return fail("Schedule not found.", 404);
  return json({ ok: true });
}

async function writeSchedule(accountId: string, id: string, value: ScheduleDraft) {
  const target = await assertTarget(accountId, value.playlistId, value.displayId, value.groupId);
  if (target) return fail(target.error, target.status);
  const updated = await db().from("schedules").update({
    name: value.name,
    playlist_id: value.playlistId,
    display_id: value.displayId,
    group_id: value.groupId,
    weekdays: value.weekdays,
    start_minute: value.startMinute,
    end_minute: value.endMinute,
    starts_on: value.startsOn,
    ends_on: value.endsOn,
    priority: value.priority,
    enabled: value.enabled,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("account_id", accountId).select("id").maybeSingle();
  if (updated.error) return fail("Couldn't update the schedule.", 500);
  if (!updated.data) return fail("Schedule not found.", 404);
  return null;
}

function asNumbers(value: unknown) {
  return Array.isArray(value) ? value.map((item) => Number(item)) : value;
}

function minutes(value: number) {
  const minute = Number(value);
  if (minute === 1440) return "24:00";
  const hour = Math.floor(minute / 60);
  const mins = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}
