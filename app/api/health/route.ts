import { db } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * Public uptime check for a free monitor (e.g. UptimeRobot, Better Stack free tier).
 * 200 = website and database reachable; 503 = database unreachable. Reveals nothing about accounts.
 */
export async function GET() {
  const started = Date.now();
  let database: "ok" | "down" = "ok";
  try {
    const { error } = await db().from("accounts").select("id", { head: true, count: "estimated" }).limit(1);
    if (error) database = "down";
  } catch {
    database = "down";
  }
  if (database === "down") console.error(JSON.stringify({ level: "error", event: "health_db_down", at: new Date().toISOString() }));
  return Response.json(
    { ok: database === "ok", database, ms: Date.now() - started, time: new Date().toISOString() },
    { status: database === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
