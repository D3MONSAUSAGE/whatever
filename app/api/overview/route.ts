import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { ONLINE_MS } from "@/lib/server/limits";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = 1000;

// Lightweight dashboard counts for this account. Online matches GET /api/displays.
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  // Independent reads run together: one database round trip of wait instead of four.
  const [displays, media, playlists, activeSchedules] = await Promise.all([
    activeDisplays(admin.accountId),
    countRows("media", admin.accountId),
    countRows("playlists", admin.accountId),
    countRows("schedules", admin.accountId, { column: "enabled", value: true }),
  ]);
  if (displays === "error" || media === "error" || playlists === "error" || activeSchedules === "error") {
    return fail("Couldn't load the overview.", 500);
  }

  const now = Date.now();
  let online = 0;
  for (const row of displays) {
    const seen = row.last_seen_at ? new Date(String(row.last_seen_at)).getTime() : NaN;
    if (!Number.isNaN(seen) && now - seen < ONLINE_MS) online += 1;
  }
  return json({
    screens: displays.length,
    online,
    offline: displays.length - online,
    media,
    playlists,
    activeSchedules,
  });
}

async function activeDisplays(accountId: string) {
  const rows: { last_seen_at?: unknown }[] = [];
  for (let from = 0; from < 100_000; from += PAGE) {
    const result = await db()
      .from("displays")
      .select("last_seen_at")
      .eq("account_id", accountId)
      .eq("status", "active")
      .order("id")
      .range(from, from + PAGE - 1);
    if (result.error) return "error" as const;
    const page = (result.data ?? []) as { last_seen_at?: unknown }[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
  return "error" as const;
}

async function countRows(
  table: "media" | "playlists" | "schedules",
  accountId: string,
  extra?: { column: string; value: boolean },
) {
  let query = db().from(table).select("id", { count: "exact", head: true }).eq("account_id", accountId);
  if (extra) query = query.eq(extra.column, extra.value);
  const result = await query;
  if (result.error || typeof result.count !== "number") return "error" as const;
  return result.count;
}
