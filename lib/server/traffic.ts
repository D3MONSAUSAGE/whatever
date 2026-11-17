import { createHash } from "node:crypto";
import { db } from "@/lib/server/supabase";
import { isMissingSchema } from "@/lib/server/schema";
import { channelFor } from "@/lib/server/dev-analytics/metrics";
import { pacificDay } from "@/lib/server/dev-analytics/range";
import { isTrackedPath, referrerHost, utmToken, type TrafficBeaconBody } from "@/lib/traffic";

/**
 * Server side of the cookieless traffic counter (migration 0031). The IP address and user agent are used only
 * in memory, together with today's random salt, to make a one-way visitor hash; they are never stored or
 * logged. Days are Pacific time, like the rest of the developer console.
 */

const BOT = /bot|crawl|spider|slurp|bing|preview|fetch|monitor|lighthouse|headless|phantom|python|curl|wget|httpclient|okhttp|java\/|go-http|axios|node-fetch|uptime|pingdom|scan/i;

export function isBotUserAgent(ua: string | null): boolean {
  return !ua || ua.length < 20 || BOT.test(ua);
}

/** Global Privacy Control or Do Not Track: the visit is not counted at all. */
export function optedOut(headers: Headers): boolean {
  return headers.get("sec-gpc") === "1" || headers.get("dnt") === "1";
}

export function visitorHash(salt: string, ip: string, ua: string): string {
  return createHash("sha256").update(`${salt}\n${ip}\n${ua}`).digest("hex").slice(0, 32);
}

/** What gets recorded for one beacon, or null when it must be ignored. Pure: no IP or UA in the result. */
export function reduceBeacon(body: unknown, now: Date): { day: string; path: string; landing: boolean; channel: string; referrerHost: string; utmSource: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Partial<TrafficBeaconBody>;
  if (!isTrackedPath(b.path)) return null;
  const landing = b.landing === true;
  const host = landing ? referrerHost(b.referrer) : "";
  const src = landing ? utmToken(b.utm_source) : "";
  const channel = landing
    ? channelFor({ utm_source: src, utm_medium: utmToken(b.utm_medium), utm_campaign: utmToken(b.utm_campaign, 100), referrer_host: host, created_at: now.toISOString() })
    : "";
  return { day: pacificDay(now), path: b.path, landing, channel: channel === "not_tracked" ? "direct" : channel, referrerHost: host, utmSource: src };
}

// Today's salt, cached per server instance. "missing" = migration 0031 not applied (re-checked every 5 min).
let saltCache: { day: string; salt: string } | null = null;
let missingUntil = 0;

/** Test hook. */
export function resetTrafficCache() {
  saltCache = null;
  missingUntil = 0;
}

export async function dailySalt(day: string, nowMs = Date.now()): Promise<string | null> {
  if (nowMs < missingUntil) return null;
  if (saltCache?.day === day) return saltCache.salt;
  const { data, error } = await db().rpc("traffic_salt", { p_day: day });
  if (error || typeof data !== "string" || data.length < 32) {
    if (isMissingSchema(error)) missingUntil = nowMs + 5 * 60_000;
    return null;
  }
  saltCache = { day, salt: data };
  return data;
}
