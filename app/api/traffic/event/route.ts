import { allow, clientIp } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";
import { pacificDay } from "@/lib/server/dev-analytics/range";
import { dailySalt, isBotUserAgent, optedOut, visitorHash } from "@/lib/server/traffic";
import { reduceFunnelEvent } from "@/lib/funnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per visitor per hour. A real visit sends a handful of events. */
const RATE_WINDOW_S = 3600;
const RATE_MAX = 60;
const MAX_BODY = 512;

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

/**
 * Signup funnel counter (migration 0032), next to the page-view counter. Always answers 204 with no body.
 * Nothing is recorded when the browser sends Global Privacy Control or Do Not Track, the user agent looks
 * automated, the request comes from another site, the body isn't an allowed (event, detail) pair, or 0031/0032
 * isn't applied. The visitor hash is used only in memory for the rate limit; it is not stored with the event.
 */
export const POST = async (req: Request): Promise<Response> => {
  try {
    if (optedOut(req.headers)) return done();
    const ua = req.headers.get("user-agent");
    if (isBotUserAgent(ua)) return done();
    const site = req.headers.get("sec-fetch-site");
    if (site && site !== "same-origin") return done();
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== new URL(req.url).host) return done();

    const text = await req.text();
    if (!text || text.length > MAX_BODY) return done();
    let body: unknown;
    try { body = JSON.parse(text); } catch { return done(); }
    const ev = reduceFunnelEvent(body);
    if (!ev) return done();

    const now = new Date();
    const day = pacificDay(now);
    const salt = await dailySalt(day, now.getTime());
    if (!salt) return done();
    const hash = visitorHash(salt, clientIp(req), ua ?? "");
    if (!(await allow(`funnel:${hash}`, RATE_WINDOW_S, RATE_MAX).catch(() => false))) return done();

    await db().rpc("funnel_record", { p_day: day, p_event: ev.event, p_detail: ev.detail });
  } catch {
    /* never affect a page */
  }
  return done();
};
