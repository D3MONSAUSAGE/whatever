import { fail, json, readJson } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { rejectSubscriptionWrite } from "@/lib/server/subscription-write";
import { layoutStudioEnabled } from "@/lib/layout-studio";
import { loadLayoutStudio, saveLayoutForAccount } from "@/lib/server/layout-boards";
import { withLocalizedErrors } from "@/lib/server/locale";
import { clientSupportsOrientation } from "@/lib/board-orientation";
import { noteMenuSaved } from "@/lib/server/onboarding-hooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The board PNG is drawn in this function. The photo is reduced to the board first;
// 60s is the ceiling if storage is slow, not the expected time.
export const maxDuration = 60;

/** Account load. Refuses before any database call unless LAYOUT_STUDIO is exactly "1". */
export const GET = withLocalizedErrors(async function GET(req: Request) {
  if (!layoutStudioEnabled()) return fail("Not found", 404);
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const loaded = await loadLayoutStudio(admin.accountId);
  if (loaded.status !== 200) return fail(loaded.error, loaded.status);
  return json({ boards: loaded.boards, legacy: loaded.legacy, library: loaded.library });
});

/** Account save. Refuses before any database call unless LAYOUT_STUDIO is exactly "1". */
export const POST = withLocalizedErrors(async function POST(req: Request) {
  if (!layoutStudioEnabled()) return fail("Not found", 404);
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const writeBlocked = await rejectSubscriptionWrite(admin.accountId, req);
  if (writeBlocked) return writeBlocked;
  const body = await readJson(req);
  const mode = body.mode === "publish" ? "publish" : body.mode === "draft" ? "draft" : null;
  if (!mode) return fail("Choose draft or publish.", 400);
  try {
    const saved = await saveLayoutForAccount(admin.accountId, {
      menuId: typeof body.menuId === "string" ? body.menuId : null,
      name: typeof body.name === "string" ? body.name : undefined,
      mode,
      document: body.document,
      orientationCapable: clientSupportsOrientation(req),
    });
    if ("error" in saved && saved.status !== 200) return fail(saved.error, saved.status, "code" in saved ? saved.code : undefined);
    // Onboarding v2: draft or publish both count once saved; stamps after the response, never affects the save.
    noteMenuSaved(req, admin.accountId, body.document);
    return json({ menuId: saved.menuId, swapped: saved.swapped });
  } catch (err) {
    console.error("layout-studio save failed", err instanceof Error ? err.message : "unknown");
    const message = err instanceof Error && err.message.startsWith("Couldn't") ? err.message : "Couldn't save the board.";
    return fail(message, 500);
  }
});
