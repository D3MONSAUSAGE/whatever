import { requireAdmin } from "@/lib/server/auth";
import { readJson } from "@/lib/server/http";
import { signOutDevices } from "@/lib/server/devices";
import { withLocalizedErrors } from "@/lib/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/session/sign-out, called BEFORE the Supabase sign-out (needs the session).
// {scope:"global"} deletes all of the caller's push_devices rows. {scope:"local", token} deletes that token only;
// {scope:"local"} with no token removes nothing. DELETE /api/devices(/:token) is unchanged and still works.
export const POST = withLocalizedErrors(async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  return signOutDevices(admin, await readJson(req));
});
