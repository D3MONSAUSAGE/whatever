import { requireAdmin } from "@/lib/server/auth";
import { unregisterDevice } from "@/lib/server/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/devices/:token (URL-encoded; FCM tokens contain ':'). Call on logout.
export async function DELETE(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { token } = await ctx.params;
  let decoded: string;
  try { decoded = decodeURIComponent(token); } catch { decoded = ""; }
  return unregisterDevice(admin, decoded);
}
