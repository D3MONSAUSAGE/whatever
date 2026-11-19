/**
 * Website traffic (cookieless, aggregate). Shared by the marketing-page beacon, the collector route and the
 * developer console. Client-safe: no server imports.
 *
 * Only the public marketing pages are measured: the six MARKETING_PATHS in English and under /es. Dashboards,
 * developer pages, sign-in, the TV player, legal pages and API routes are never accepted.
 */
import { localizedPath, MARKETING_PATHS } from "@/lib/seo";
import type { ChannelKey } from "@/lib/dev-analytics";
import type { DevFunnel } from "@/lib/funnel";

export const TRACKED_PATHS: readonly string[] = MARKETING_PATHS.flatMap((p) => [localizedPath(p, "en"), localizedPath(p, "es")]);

export function isTrackedPath(path: unknown): path is string {
  return typeof path === "string" && TRACKED_PATHS.includes(path);
}

/** Beacon body. Values are only hints: the server validates and reduces every field. */
export type TrafficBeaconBody = {
  path: string;
  /** First page of this visit (per browser tab). Only landings carry a source. */
  landing: boolean;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
};

/** Hosts that are this site; a referrer from them is in-site navigation, not a source. */
const SELF_HOST = /(^|\.)(pekkotv\.com|pantalla-chi\.vercel\.app|localhost)$/;

/** A referring URL reduced to its lowercase host ("" when missing, invalid, or this site). Never the path or query. */
export function referrerHost(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "";
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    if (!/^[a-z0-9.-]{1,100}$/.test(host) || SELF_HOST.test(host)) return "";
    return host;
  } catch {
    return "";
  }
}

/** A utm value reduced to a short lowercase token ("" otherwise), so free text and ids are never stored. */
export function utmToken(raw: unknown, max = 60): string {
  if (typeof raw !== "string") return "";
  const v = raw.trim().toLowerCase();
  return /^[a-z0-9._-]+$/.test(v) && v.length <= max ? v : "";
}

// ---------------------------------------------------------------- developer console shapes

/** Channels shown in the Website traffic tab (same keys and labels as sign-up attribution). */
export const TRAFFIC_CHANNELS = ["meta", "google_ads", "google_organic", "referral", "campaign_other", "direct"] as const satisfies readonly ChannelKey[];

export type TrafficNoteKey = "collectingSince" | "notCollecting" | "cookieless" | "signedInSkipped" | "visitorsSummed" | "conversionEstimate" | "customersOnly" | "attributionSince" | "smallGroups";
export type TrafficNote = { key: TrafficNoteKey; vars?: Record<string, string | number> };

export type DevTraffic = {
  generatedAt: string;
  /** false until migration 0031 is applied in this database. Nothing is invented in that case. */
  collecting: boolean;
  range: { fromDay: string; toDay: string };
  /** First day with any recorded traffic, or null. */
  firstDay: string | null;
  totals: { visitors: number; pageViews: number; landings: number };
  daily: { day: string; visitors: number; pageViews: number; landings: number }[];
  /** Pages by landings (top landing pages), with their total page views. */
  pages: { path: string; landings: number; pageViews: number }[];
  /** Landings and new customer registrations per channel, for the same range. */
  channels: { key: (typeof TRAFFIC_CHANNELS)[number]; landings: number; registrations: number | null; conversion: number | null }[];
  /** Top referring sites (landings), hosts only. */
  referrers: { host: string; landings: number }[];
  /** Customer registrations in range (internal/QA/demo/reviewer accounts excluded) and the estimated rate. */
  registrations: { customers: number; conversion: number | null };
  /** Signup funnel (0032 events + account data). */
  funnel: DevFunnel;
  notes: TrafficNote[];
};
