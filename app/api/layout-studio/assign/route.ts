import { layoutStudioEnabled, parseLayout } from "@/lib/layout-studio";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { fail, json, readJson } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Point one screen at a published board's playlist.
 * Other screens keep their assignments. Republishing the board still uses menu_swap_media.
 */
export async function POST(req: Request) {
  if (!layoutStudioEnabled()) return fail("Not found", 404);
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  if (!isUuid(body.menuId) || !isUuid(body.displayId)) return fail("That board or screen isn't in this account.", 404);
  const menu = await db()
    .from("menus")
    .select("id, playlist_id, content")
    .eq("id", body.menuId)
    .eq("account_id", admin.accountId)
    .maybeSingle();
  if (menu.error) return fail("Couldn't assign that board.", 500);
  if (!menu.data || !parseLayout(menu.data.content).ok) return fail("That isn't a layout board.", 404);
  if (!menu.data.playlist_id) return fail("Publish the board before assigning it to a screen.", 400);
  const display = await db()
    .from("displays")
    .select("id, content_version")
    .eq("id", body.displayId)
    .eq("account_id", admin.accountId)
    .eq("status", "active")
    .maybeSingle();
  if (display.error) return fail("Couldn't assign that board.", 500);
  if (!display.data) return fail("That board or screen isn't in this account.", 404);
  const version = Number(display.data.content_version ?? 0) + 1;
  const updated = await db()
    .from("displays")
    .update({
      assigned_playlist_id: menu.data.playlist_id,
      assigned_media_id: null,
      content_version: version,
    })
    .eq("id", body.displayId)
    .eq("account_id", admin.accountId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (updated.error) return fail("Couldn't assign that board.", 500);
  if (!updated.data) return fail("That board or screen isn't in this account.", 404);
  return json({ ok: true, playlistId: String(menu.data.playlist_id), displayId: body.displayId });
}
