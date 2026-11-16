import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { screenCounts, type CountRow } from "@/lib/server/screen-counts";
import { fail, json } from "@/lib/server/http";
import { withLocalizedErrors } from "@/lib/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = 1000;

// Lightweight dashboard counts for this account.
// Phase 1 (t353u): a screen counts as online only when a TV is connected (token collected) and its
// heartbeat is fresh, matching web My Screens (lib/sync-line.ts onlineNow). offline = connected and not
// online. waiting (additive) = no TV connected yet. screens stays the total of active screens, so
// screens === online + offline + waiting. Every older field keeps its name and number type (+14 reads them).
export const GET = withLocalizedErrors(async function GET(req: Request) {
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

  const counts = screenCounts(displays, Date.now());
  return json({
    screens: displays.length,
    online: counts.online,
    offline: counts.offline,
    media,
    playlists,
    activeSchedules,
    waiting: counts.waiting,
  });
});

async function activeDisplays(accountId: string) {
  const rows: CountRow[] = [];
  for (let from = 0; from < 100_000; from += PAGE) {
    const result = await db()
      .from("displays")
      .select("token_hash, last_seen_at")
      .eq("account_id", accountId)
      .eq("status", "active")
      .order("id")
      .range(from, from + PAGE - 1);
    if (result.error) return "error" as const;
    const page = (result.data ?? []) as CountRow[];
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
