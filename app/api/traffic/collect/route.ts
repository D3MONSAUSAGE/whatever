import { allow, clientIp } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";
import { dailySalt, isBotUserAgent, optedOut, reduceBeacon, visitorHash } from "@/lib/server/traffic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per visitor per hour; generous for real browsing, cheap protection against scripted inflation. */
const RATE_WINDOW_S = 3600;
const RATE_MAX = 240;
const MAX_BODY = 2048;

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

/**
 * Cookieless page-view counter for the public marketing pages (migration 0031). Always answers 204 with no
 * body, whatever happens, so it never reveals anything and never breaks a page. Nothing is recorded when:
 * the path isn't a marketing page, the browser sends Global Privacy Control or Do Not Track, the user agent
 * looks automated, the request comes from another site, the body is malformed, or 0031 isn't applied.
 * The IP address and user agent are only hashed in memory with today's random salt; neither is stored.
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
    const now = new Date();
    const view = reduceBeacon(body, now);
    if (!view) return done();

    const salt = await dailySalt(view.day, now.getTime());
    if (!salt) return done();
    const hash = visitorHash(salt, clientIp(req), ua ?? "");
    if (!(await allow(`traffic:${hash}`, RATE_WINDOW_S, RATE_MAX).catch(() => false))) return done();

    await db().rpc("traffic_record", {
      p_day: view.day, p_visitor_hash: hash, p_path: view.path, p_landing: view.landing,
      p_channel: view.channel || "direct", p_referrer_host: view.referrerHost, p_utm_source: view.utmSource,
    });
  } catch {
    /* never fail a page view */
  }
  return done();
};
