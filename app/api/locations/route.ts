import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isMissingSchema, SCHEDULES_UNAVAILABLE } from "@/lib/server/schema";
import { isValidTimeZone } from "@/lib/server/schedule";
import { normalizePlaylistName } from "@/lib/server/validate";
import { fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LOCATIONS = 50;

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const loaded = await loadLocations(admin.accountId);
  if (loaded === "error") return fail("Couldn't load locations.", 500);
  const displays = await db()
    .from("displays")
    .select("location_id")
    .eq("account_id", admin.accountId)
    .eq("status", "active");
  if (displays.error) return fail("Couldn't load locations.", 500);
  const counts = new Map<string, number>();
  for (const display of displays.data ?? []) {
    const id = display.location_id ? String(display.location_id) : "";
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return json(loaded.map((location) => ({ ...location, displayCount: counts.get(location.id) ?? 0 })));
}

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const name = normalizePlaylistName(body.name);
  if (!name) return fail("Give this location a name.", 400);
  const timezone = body.timezone == null || body.timezone === "" ? "UTC" : String(body.timezone);
  if (!isValidTimeZone(timezone)) return fail("That timezone isn't an IANA name like America/Los_Angeles.", 400);

  const existing = await db().from("locations").select("id").eq("account_id", admin.accountId);
  if (existing.error) return fail("Couldn't add the location.", 500);
  if ((existing.data ?? []).length >= MAX_LOCATIONS) return fail("This account already has 50 locations.", 400);

  const inserted = await db()
    .from("locations")
    .insert({ account_id: admin.accountId, name, timezone })
    .select("id")
    .single();
  if (inserted.error) {
    if (isMissingSchema(inserted.error)) return fail(SCHEDULES_UNAVAILABLE, 503);
    return fail("Couldn't add the location.", 500);
  }
  return json({ id: inserted.data.id }, 201);
}

export async function loadLocations(accountId: string) {
  const rich = await db().from("locations").select("id, name, timezone, created_at").eq("account_id", accountId).order("created_at");
  if (!rich.error) {
    return (rich.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      timezone: typeof row.timezone === "string" && row.timezone ? row.timezone : "UTC",
    }));
  }
  if (!isMissingSchema(rich.error)) return "error" as const;
  const plain = await db().from("locations").select("id, name, created_at").eq("account_id", accountId).order("created_at");
  if (plain.error) return "error" as const;
  return (plain.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name), timezone: "UTC" }));
}
