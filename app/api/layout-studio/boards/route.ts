import { parseLayout } from "@/lib/layout-studio";
import { layoutStudioEnabled } from "@/lib/layout-studio";
import { requireAdmin } from "@/lib/server/auth";
import { fail, json } from "@/lib/server/http";
import { signAll } from "@/lib/server/paging";
import { db } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Layout boards only. Classic menus stay on GET /api/menus. */
export async function GET(req: Request) {
  if (!layoutStudioEnabled()) return fail("Not found", 404);
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const menus = await db().from("menus").select("id, name, content, media_id").eq("account_id", admin.accountId);
  if (menus.error) return fail("Couldn't load boards.", 500);
  const boards = [];
  for (const menu of menus.data ?? []) {
    const parsed = parseLayout(menu.content);
    if (!parsed.ok) continue;
    boards.push({
      id: String(menu.id),
      name: String(menu.name),
      template: parsed.value.template,
      mediaId: menu.media_id ? String(menu.media_id) : null,
    });
  }
  const mediaIds = boards.map((board) => board.mediaId).filter((id): id is string => Boolean(id));
  const media = mediaIds.length
    ? await db().from("media").select("id, storage_path").eq("account_id", admin.accountId).in("id", mediaIds)
    : { data: [], error: null };
  if (media.error) return fail("Couldn't load boards.", 500);
  const pathById = new Map((media.data ?? []).map((row) => [String(row.id), String(row.storage_path ?? "")]));
  const signed = await signAll([...pathById.values()].filter(Boolean));
  return json({
    boards: boards.map((board) => {
      const path = board.mediaId ? pathById.get(board.mediaId) : "";
      return {
        id: board.id,
        name: board.name,
        template: board.template,
        thumbnailUrl: path ? signed.get(path) ?? null : null,
      };
    }),
  });
}
