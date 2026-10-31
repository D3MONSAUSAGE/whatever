import { requireAdmin } from "@/lib/server/auth";
import { readJson } from "@/lib/server/http";
import { listDevices, registerDevice, unregisterDevice } from "@/lib/server/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: this login's devices (tokens masked). POST {token, platform, appVersion?, notifyOffline?, notifyRecovery?}.
// DELETE {token}: same as DELETE /api/devices/:token, for clients that prefer a body.
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  return listDevices(admin);
}

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  return registerDevice(admin, await readJson(req));
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  return unregisterDevice(admin, (await readJson(req)).token);
}
