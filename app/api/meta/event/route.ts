import { after } from "next/server";
import { json, fail, readJson, clientIp, enforceLimit } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { metaConfig } from "@/lib/server/meta/config";
import { BROWSER_EVENTS, type MetaEventName } from "@/lib/server/meta/capi";
import { supabaseMetaStore } from "@/lib/server/meta/store";
import { track } from "@/lib/server/meta/track";
import { gpc, readCookie, validFbc, validFbp, visitorId } from "@/lib/server/meta/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const EVENT_ID = /^[A-Za-z0-9:_-]{8,100}$/;

/** Server half of a browser event (same event_name + event_id as fbq, so Meta dedupes). Always 202, never blocks. */
export async function POST(req: Request) {
  if (!metaConfig().capiEnabled) return json({ queued: false }, 202);
  const body = await readJson(req);
  const name = body.name as MetaEventName;
  if (!BROWSER_EVENTS.includes(name) || typeof body.eventId !== "string" || !EVENT_ID.test(body.eventId)) return fail("Bad event.", 400);
  const id = visitorId(req);
  if (!id || gpc(req)) return json({ queued: false }, 202);
  const limited = await enforceLimit(`meta-ev:${id}`, 60, 30, "Too many events.").catch(() => null);
  if (limited) return limited;
  const consent = await supabaseMetaStore.consentByVisitor(id).catch(() => null);
  if (consent?.status !== "granted") return json({ queued: false }, 202);

  let email: string | undefined;
  let eventId = body.eventId;
  if (name === "CompleteRegistration") {
    const admin = await requireAdmin(req);
    if (admin instanceof Response) return admin;
    email = admin.email;
    eventId = `reg:${admin.userId}`; // one per user regardless of what the client sends
    await supabaseMetaStore.touch(id, { user_id: admin.userId });
  }
  const fbp = readCookie(req, "_fbp"), fbc = readCookie(req, "_fbc");
  await supabaseMetaStore.touch(id, { ...(validFbp(fbp) ? { fbp } : {}), ...(validFbc(fbc) ? { fbc } : {}) }).catch(() => {});
  const fresh = { ...consent, fbp: validFbp(fbp) ? fbp : consent.fbp, fbc: validFbc(fbc) ? fbc : consent.fbc };
  after(() => track({ name, eventId, consent: fresh, ids: { email, ip: clientIp(req), ua: req.headers.get("user-agent") }, custom: body.custom as Record<string, unknown>, sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : undefined }));
  return json({ queued: true, eventId }, 202);
}
