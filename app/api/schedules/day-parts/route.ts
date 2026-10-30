import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { isMissingSchema, SCHEDULES_UNAVAILABLE as SCHEDULES_UNAVAILABLE_TEXT } from "@/lib/server/schema";
import { isUuid } from "@/lib/server/crypto";
import { CREATE_SCHEDULE_MAX_PER_USER, CREATE_SCHEDULE_RATE_MESSAGE, CREATE_WINDOW_SECONDS } from "@/lib/server/limits";
import { parseScheduleBody, type ScheduleDraft } from "@/lib/server/schedule";
import { assertTarget } from "@/lib/server/schedule-target";
const DAY_PART_MAX = 6;
const MAX_SCHEDULES = 200;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Breakfast / lunch / dinner in one step. Each part becomes an ordinary row in
 * the existing schedules table. A part can name a playlist or a menu board.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const parts = body.parts;
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > DAY_PART_MAX) return fail(`Add 1 to ${DAY_PART_MAX} parts of the day.`, 400);

  const drafts: ScheduleDraft[] = [];
  for (const raw of parts) {
    if (!raw || typeof raw !== "object") return fail("Check each part of the day.", 400);
    const part = raw as Record<string, unknown>;
    let playlistId = part.playlistId;
    if (part.menuId != null) {
      if (typeof part.menuId !== "string" || !isUuid(part.menuId)) return fail("Menu not found.", 404);
      const menu = await db().from("menus").select("playlist_id").eq("id", part.menuId).eq("account_id", admin.accountId).maybeSingle();
      if (menu.error) return isMissingSchema(menu.error) ? fail(SCHEDULES_UNAVAILABLE_TEXT, 503) : fail("Couldn't add the schedule.", 500);
      if (!menu.data?.playlist_id) return fail("Menu not found.", 404);
      playlistId = menu.data.playlist_id;
    }
    const parsed = parseScheduleBody({
      name: part.name, playlistId, displayId: body.displayId, groupId: body.groupId,
      weekdays: body.weekdays ?? [1, 2, 3, 4, 5, 6, 7], startTime: part.startTime, endTime: part.endTime,
      priority: 10,
    });
    if (!parsed.ok) return fail(`${String(part.name || "Part")}: ${parsed.error}`, 400);
    drafts.push(parsed.value);
  }

  const limited = await enforceLimit(`create-schedule:${admin.userId}`, CREATE_WINDOW_SECONDS, CREATE_SCHEDULE_MAX_PER_USER, CREATE_SCHEDULE_RATE_MESSAGE);
  if (limited) return limited;
  const count = await db().from("schedules").select("id").eq("account_id", admin.accountId);
  if (count.error) return isMissingSchema(count.error) ? fail(SCHEDULES_UNAVAILABLE_TEXT, 503) : fail("Couldn't add the schedule.", 500);
  if ((count.data ?? []).length + drafts.length > MAX_SCHEDULES) return fail("This account already has 200 schedules.", 400);

  for (const d of drafts) {
    const target = await assertTarget(admin.accountId, d.playlistId, d.displayId, d.groupId);
    if (target) return fail(`${d.name}: ${target.error}`, target.status);
  }

  const now = new Date().toISOString();
  const inserted = await db().from("schedules").insert(drafts.map((d) => ({
    account_id: admin.accountId, name: d.name, playlist_id: d.playlistId, display_id: d.displayId, group_id: d.groupId,
    weekdays: d.weekdays, start_minute: d.startMinute, end_minute: d.endMinute, starts_on: d.startsOn, ends_on: d.endsOn,
    priority: d.priority, enabled: d.enabled, updated_at: now,
  }))).select("id");
  if (inserted.error) return isMissingSchema(inserted.error) ? fail(SCHEDULES_UNAVAILABLE_TEXT, 503) : fail("Couldn't add the schedule.", 500);
  return json({ ids: (inserted.data ?? []).map((r) => r.id) }, 201);
}
