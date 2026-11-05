import { requireAdmin } from "@/lib/server/auth";
import { fail, json } from "@/lib/server/http";
import { loadRemoteScreens } from "@/lib/server/remote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Screens the signed-in owner can remote-control, with live playback state. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const loaded = await loadRemoteScreens(admin.accountId);
  if (!loaded.ok) {
    if (loaded.missingSchema) return fail("Remote control is not available yet.", 503);
    return fail("Couldn't load screens.", 500);
  }
  return json(loaded.screens);
}
