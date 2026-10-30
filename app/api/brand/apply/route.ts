import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { isUuid } from "@/lib/server/crypto";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { MENUS_UNAVAILABLE, isMissingSchema, rerenderMenu, type MenuRow } from "@/lib/server/menus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 8;

/**
 * Re-render menus that use the brand, a batch at a time. Call again with `after` = `next`
 * until `next` is null.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const after = typeof body.after === "string" && isUuid(body.after) ? body.after : null;
  const limited = await enforceLimit(`brand-apply:${admin.userId}`, 60, 30, "Too many updates. Wait a minute.");
  if (limited) return limited;
  let q = db().from("menus").select("id, name, template, content, media_id, playlist_id, created_at, updated_at")
    .eq("account_id", admin.accountId).order("id").limit(BATCH);
  if (after) q = q.gt("id", after);
  const rows = await q;
  if (rows.error) return isMissingSchema(rows.error) ? fail(MENUS_UNAVAILABLE, 503) : fail("Couldn't load your menus.", 500);
  const list = (rows.data ?? []) as MenuRow[];
  let updated = 0, skipped = 0, failed = 0;
  for (const row of list) {
    const content = row.content as { useBrand?: unknown } | null;
    if (content && content.useBrand === false) { skipped++; continue; }
    const r = await rerenderMenu(admin.accountId, row, {});
    if ("ok" in r) updated++; else failed++;
  }
  return json({ updated, skipped, failed, next: list.length === BATCH ? list[list.length - 1].id : null });
}
