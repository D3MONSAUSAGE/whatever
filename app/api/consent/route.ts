import { randomUUID } from "node:crypto";
import { json, fail, readJson, clientIp, enforceLimit } from "@/lib/server/http";
import { metaConfig } from "@/lib/server/meta/config";
import { supabaseMetaStore } from "@/lib/server/meta/store";
import { gpc, visitorCookie, visitorId, validFbclid } from "@/lib/server/meta/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the banner needs. The Pixel id is only returned when the flag is on AND consent is recorded AND no GPC. */
export async function GET(req: Request) {
  const cfg = metaConfig();
  const enabled = cfg.pixelEnabled || cfg.capiEnabled;
  const id = visitorId(req);
  let consent: "granted" | "withdrawn" | "unset" = "unset";
  if (enabled && id) consent = (await supabaseMetaStore.consentByVisitor(id).catch(() => null))?.status ?? "unset";
  const g = gpc(req);
  const granted = consent === "granted" && !g;
  return json({ enabled, gpc: g, consent, pixelId: granted && cfg.pixelEnabled ? cfg.pixelId : null });
}

export async function POST(req: Request) {
  const limited = await enforceLimit(`consent:${clientIp(req)}`, 60, 20, "Too many requests.").catch(() => null);
  if (limited) return limited;
  const body = await readJson(req);
  const cfg = metaConfig();
  if (body.choice === "withdraw") {
    const id = visitorId(req);
    if (id) await supabaseMetaStore.withdraw(id).catch(() => {});
    // Expire Meta's own first-party cookies too.
    const h = new Headers({ "Cache-Control": "no-store", "Content-Type": "application/json" });
    for (const c of ["_fbp", "_fbc"]) h.append("Set-Cookie", `${c}=; Path=/; Max-Age=0`);
    return new Response(JSON.stringify({ consent: "withdrawn" }), { status: 200, headers: h });
  }
  if (body.choice !== "grant") return fail("Unknown choice.", 400);
  if (!cfg.pixelEnabled && !cfg.capiEnabled) return json({ consent: "unset", enabled: false });
  if (gpc(req)) return fail("Your browser's Global Privacy Control signal is on, so marketing tracking stays off.", 409);
  const id = visitorId(req) ?? randomUUID();
  const fbclid = validFbclid(body.fbclid) ? body.fbclid : null;
  await supabaseMetaStore.grant({ visitor_id: id, consent_version: cfg.consentVersion, fbclid, fbc: fbclid ? `fb.1.${Date.now()}.${fbclid}` : null });
  return json({ consent: "granted", pixelId: cfg.pixelEnabled ? cfg.pixelId : null }, 200, { "Set-Cookie": visitorCookie(id, 395) });
}
