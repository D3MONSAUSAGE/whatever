import { fail, json, readJson } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { layoutStudioEnabled } from "@/lib/layout-studio";
import { loadLayoutStudio, saveLayoutForAccount } from "@/lib/server/layout-boards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Account load. Refuses before any database call unless LAYOUT_STUDIO is exactly "1". */
export async function GET(req: Request) {
  if (!layoutStudioEnabled()) return fail("Not found", 404);
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const loaded = await loadLayoutStudio(admin.accountId);
  if (loaded.status !== 200) return fail(loaded.error, loaded.status);
  return json({ boards: loaded.boards, legacy: loaded.legacy, library: loaded.library });
}

/** Account save. Refuses before any database call unless LAYOUT_STUDIO is exactly "1". */
export async function POST(req: Request) {
  if (!layoutStudioEnabled()) return fail("Not found", 404);
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const mode = body.mode === "publish" ? "publish" : body.mode === "draft" ? "draft" : null;
  if (!mode) return fail("Choose draft or publish.", 400);
  try {
    const saved = await saveLayoutForAccount(admin.accountId, {
      menuId: typeof body.menuId === "string" ? body.menuId : null,
      name: typeof body.name === "string" ? body.name : undefined,
      mode,
      document: body.document,
    });
    if ("error" in saved && saved.status !== 200) return fail(saved.error, saved.status);
    return json({ menuId: saved.menuId, swapped: saved.swapped });
  } catch {
    return fail("Couldn't save the board.", 500);
  }
}
