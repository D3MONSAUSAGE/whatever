import { db } from "@/lib/server/supabase";
import { renderMenuPng } from "@/lib/server/menu-render";

export const dynamic = "force-dynamic";

/**
 * Public uptime check for a free monitor (e.g. UptimeRobot, Better Stack free tier).
 * 200 = website and database reachable; 503 = database unreachable. Reveals nothing about accounts.
 */
export async function GET(req: Request) {
  const started = Date.now();
  let database: "ok" | "down" = "ok";
  try {
    const { error } = await db().from("accounts").select("id", { head: true, count: "estimated" }).limit(1);
    if (error) database = "down";
  } catch {
    database = "down";
  }
  if (database === "down") console.error(JSON.stringify({ level: "error", event: "health_db_down", at: new Date().toISOString() }));
  // ?render=1: render a fixed tiny menu (no account, no data) to prove the menu renderer and fonts work on this deployment.
  let render: { ok: boolean; bytes?: number } | undefined;
  if (new URL(req.url).searchParams.get("render") === "1") {
    try {
      const png = renderMenuPng("classic", { title: "Health", subtitle: "", footer: "", sections: [{ name: "", items: [{ name: "Check", price: "$1", description: "" }] }] });
      render = { ok: png.length > 1000, bytes: png.length };
    } catch {
      render = { ok: false };
    }
  }
  return Response.json(
    { ok: database === "ok", database, ...(render ? { render } : {}), ms: Date.now() - started, time: new Date().toISOString() },
    { status: database === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
