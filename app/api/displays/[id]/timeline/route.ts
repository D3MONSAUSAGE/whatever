import { loadDisplaySchedules } from "@/lib/server/display-schedules";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { fail, json } from "@/lib/server/http";
import { loadLocations } from "@/lib/server/locations";
import { db } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** The same nextChange object that GET /api/displays puts on the row. */
export async function GET(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Display not found.", 404);
  const display = await db()
    .from("displays")
    .select("id, location_id")
    .eq("id", id)
    .eq("account_id", admin.accountId)
    .eq("status", "active")
    .maybeSingle();
  if (display.error || !display.data) return display.error ? fail("Couldn't load that screen.", 500) : fail("Display not found.", 404);
  const row = display.data;
  const locations = await loadLocations(admin.accountId);
  if (locations === "error") return fail("Couldn't load that screen.", 500);
  const zone = row.location_id
    ? locations.find((location) => location.id === row.location_id)?.timezone ?? "UTC"
    : "UTC";
  const info = await loadDisplaySchedules(admin.accountId, [{ id, timeZone: zone }]);
  if (info === null) return fail("Couldn't load that screen.", 500);
  return json({
    displayId: id,
    timezone: zone,
    nextChange: info.get(id)?.nextChange ?? null,
  });
}
