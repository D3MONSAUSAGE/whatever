import type { DevAnalytics } from "@/lib/dev-analytics";
import { TRAFFIC_CHANNELS, type DevTraffic, type TrafficNote } from "@/lib/traffic";
import type { Range } from "@/lib/server/dev-analytics/range";
import { CTA_LOCATIONS, SIGNUP_ERROR_CODES, TEMPLATE_TRY_SPOTS, type DevFunnel } from "@/lib/funnel";

/** Rows returned by dev_funnel_snapshot (migration 0032). */
export type FunnelSnapshot = { first_day: string | null; rows: { event: string; detail: string; count: number }[] };

/**
 * Signup funnel: landings (0031) → trial CTA clicks → signup page views → submits (0032) → customer
 * registrations → email confirmations (account data, same customer rules as the rest of the console).
 * `funnel` null = 0032 not applied: browser stages are zero and collecting=false.
 */
export function buildFunnel(input: { funnel: FunnelSnapshot | null; landings: number; registrations: number; confirmed: number }): DevFunnel {
  const rows = input.funnel?.rows ?? [];
  const sum = (event: string, detail?: string) => rows.filter((r) => r.event === event && (detail === undefined || r.detail === detail)).reduce((n, r) => n + r.count, 0);
  const raw: [DevFunnel["stages"][number]["key"], number][] = [
    ["landings", input.landings],
    ["ctaClicks", sum("cta_click")],
    ["signupViews", sum("signup_view")],
    ["signupSubmits", sum("signup_submit")],
    ["registrations", input.registrations],
    ["confirmed", input.confirmed],
  ];
  const stages = raw.map(([key, count], i) => ({ key, count, fromPrevious: i === 0 ? null : rate(count, raw[i - 1][1]) }));
  return {
    collecting: !!input.funnel,
    firstDay: input.funnel?.first_day ? String(input.funnel.first_day).slice(0, 10) : null,
    stages,
    ctaByLocation: CTA_LOCATIONS.map((location) => ({ location, count: sum("cta_click", location) })),
    errorsByCode: SIGNUP_ERROR_CODES.map((code) => ({ code, count: sum("signup_error", code) })).filter((e) => e.count > 0),
    templateTries: TEMPLATE_TRY_SPOTS.map((spot) => ({ spot, count: sum("template_try", spot) })),
  };
}

/** Rows returned by dev_traffic_snapshot (migration 0031). */
export type TrafficSnapshot = {
  first_day: string | null;
  daily: { day: string; visitors: number; page_views: number; landings: number }[];
  pages: { path: string; page_views: number; landings: number }[];
  sources: { channel: string; referrer_host: string; utm_source: string; landings: number }[];
};

const rate = (num: number | null, den: number): number | null => (num === null || den <= 0 ? null : num / den);

/**
 * Builds the Website traffic tab. Registrations come from the existing customer analytics (computeDashboard
 * with includeInternal=false), so internal, QA, demo and reviewer accounts and every analytics_exclusions row
 * are left out exactly as in the rest of the console. Conversion is an estimate: registrations ÷ visitors in
 * the same range; nothing joins an individual visitor to an account.
 * `traffic` null means migration 0031 isn't applied: totals are zero and collecting=false (no invented data).
 */
export function buildTrafficReport(input: { traffic: TrafficSnapshot | null; funnel?: FunnelSnapshot | null; customers: DevAnalytics; range: Range; now: Date }): DevTraffic {
  const { traffic, customers, range, now } = input;
  const daily = (traffic?.daily ?? []).map((d) => ({ day: String(d.day).slice(0, 10), visitors: d.visitors, pageViews: d.page_views, landings: d.landings }));
  const totals = daily.reduce((t, d) => ({ visitors: t.visitors + d.visitors, pageViews: t.pageViews + d.pageViews, landings: t.landings + d.landings }), { visitors: 0, pageViews: 0, landings: 0 });

  const landingsBy = new Map<string, number>();
  const referrers = new Map<string, number>();
  for (const s of traffic?.sources ?? []) {
    landingsBy.set(s.channel, (landingsBy.get(s.channel) ?? 0) + s.landings);
    if (s.referrer_host) referrers.set(s.referrer_host, (referrers.get(s.referrer_host) ?? 0) + s.landings);
  }
  const regsBy = new Map(customers.attribution.channels.map((c) => [c.key, c.accounts]));
  const channels = TRAFFIC_CHANNELS.map((key) => {
    const landings = landingsBy.get(key) ?? 0;
    const registrations = regsBy.has(key) ? regsBy.get(key)! : 0;
    return { key, landings, registrations, conversion: rate(registrations, landings) };
  });

  const registered = customers.overview.accounts.newInRange;
  const notes: TrafficNote[] = [];
  if (!traffic) notes.push({ key: "notCollecting" });
  else if (traffic.first_day) notes.push({ key: "collectingSince", vars: { date: String(traffic.first_day).slice(0, 10) } });
  notes.push({ key: "cookieless" }, { key: "signedInSkipped" }, { key: "visitorsSummed" }, { key: "conversionEstimate" }, { key: "customersOnly" });
  for (const n of customers.attribution.notes) if (n.key === "attributionSince") notes.push({ key: "attributionSince", vars: n.vars });
  notes.push({ key: "smallGroups" });

  return {
    generatedAt: now.toISOString(),
    collecting: !!traffic,
    range: { fromDay: range.fromDay, toDay: range.toDay },
    firstDay: traffic?.first_day ? String(traffic.first_day).slice(0, 10) : null,
    totals,
    daily,
    pages: (traffic?.pages ?? []).map((p) => ({ path: p.path, landings: p.landings, pageViews: p.page_views })).slice(0, 12),
    channels,
    referrers: [...referrers.entries()].map(([host, landings]) => ({ host, landings })).sort((a, b) => b.landings - a.landings || a.host.localeCompare(b.host)).slice(0, 10),
    registrations: { customers: registered, conversion: traffic ? rate(registered, totals.visitors) : null },
    funnel: buildFunnel({ funnel: input.funnel ?? null, landings: totals.landings, registrations: registered, confirmed: customers.overview.users.confirmedNewInRange }),
    notes,
  };
}
