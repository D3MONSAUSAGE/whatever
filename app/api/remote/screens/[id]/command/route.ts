import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { fail, json, readJson } from "@/lib/server/http";
import { isMissingSchema } from "@/lib/server/schema";
import { displayAccess, loadRemoteScreen } from "@/lib/server/remote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Issue next/prev for a screen the caller owns. Returns the updated screen state. */
export async function POST(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Screen not found.", 404);

  const access = await displayAccess(admin.accountId, id);
  if (access === "foreign") return fail("You don't have access to that screen.", 403);
  if (access === "missing") return fail("Screen not found.", 404);
  if (access === "error") return fail("Couldn't send the command.", 500);

  const body = await readJson(req);
  const command = body.command === "next" || body.command === "prev" ? body.command : null;
  if (!command) return fail("Send command \"next\" or \"prev\".", 400);

  const { data, error } = await db().rpc("enqueue_display_command", {
    p_account_id: admin.accountId,
    p_display_id: id,
    p_user_id: admin.userId,
    p_command: command,
  });
  if (error) {
    if (isMissingSchema(error)) return fail("Remote control is not available yet.", 503);
    return fail("Couldn't send the command.", 500);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.seq == null) {
    return fail("Screen has no published playlist assigned.", 404);
  }

  const loaded = await loadRemoteScreen(admin.accountId, id);
  if (!loaded.ok) return fail("Couldn't load screen state.", 500);
  return json({
    ok: true,
    seq: Number(row.seq),
    commandId: row.command_id,
    command,
    screen: loaded.screen,
  });
}
