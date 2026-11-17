import type { AlertItem } from "@/lib/api";

/**
 * Notification center grouping. Pure, so it is unit-tested and shared by the bell panel and the history page.
 *
 * Input is the existing /api/alerts feed (one row per screen.offline / screen.recovered alert, newest first).
 * Nothing here changes what is stored: grouping is display-only, and marking a group read sends every
 * underlying alert id to /api/alerts/read, exactly as the old banner and alerts page did.
 *
 * 1. Episodes: an offline alert and the recovery that ends it share (screen, offline_since), so they become
 *    one episode ("Kitchen was offline 12 min, back at 2:14 PM").
 * 2. Bursts: 3+ different screens whose episodes start within 5 minutes become one group
 *    ("4 screens went offline around 9:02 AM"), which is usually power or Wi-Fi.
 * 3. Flapping: 3+ episodes for one screen within 24 hours become one group ("dropped offline 3 times").
 * Everything else stays one episode per row.
 */

export const BURST_WINDOW_MS = 5 * 60_000;
export const BURST_MIN_SCREENS = 3;
export const FLAP_WINDOW_MS = 24 * 3_600_000;
export const FLAP_MIN_EPISODES = 3;
export const READ_BATCH = 100;

export type Episode = {
  key: string;
  screenKey: string;
  screenId: string | null;
  screenName: string;
  offlineSince: string;
  /** Time of the latest alert in the episode. */
  at: string;
  resolved: boolean;
  backAt: string | null;
  offlineSeconds: number | null;
  ids: string[];
  read: boolean;
};

export type NotificationGroup = {
  key: string;
  kind: "offline" | "recovered" | "flap" | "burst";
  ids: string[];
  read: boolean;
  at: string;
  /** A screen in this group is still offline (its latest episode has no recovery). */
  attention: boolean;
  screenId: string | null;
  screenName: string;
  offlineSince: string;
  backAt: string | null;
  offlineSeconds: number | null;
  count: number;
  members: Episode[];
};

const ms = (iso: string) => new Date(iso).getTime();
const screenKeyOf = (a: Pick<AlertItem, "screenId" | "screenName">) => a.screenId ?? `name:${a.screenName}`;

export function toEpisodes(alerts: AlertItem[]): Episode[] {
  const byKey = new Map<string, Episode>();
  for (const a of alerts) {
    const screenKey = screenKeyOf(a);
    const key = `${screenKey}|${a.offlineSince}`;
    let ep = byKey.get(key);
    if (!ep) {
      ep = { key, screenKey, screenId: a.screenId, screenName: a.screenName, offlineSince: a.offlineSince, at: a.at, resolved: false, backAt: null, offlineSeconds: null, ids: [], read: true };
      byKey.set(key, ep);
    }
    ep.ids.push(a.id);
    ep.read = ep.read && a.read;
    if (ms(a.at) > ms(ep.at)) ep.at = a.at;
    if (a.kind === "screen.recovered") {
      ep.resolved = true;
      ep.backAt = a.at;
      ep.offlineSeconds = a.offlineSeconds;
      ep.screenName = a.screenName;
    }
  }
  return [...byKey.values()].sort((x, y) => ms(y.at) - ms(x.at));
}

/** The newest episode per screen; a screen is offline now when that episode has no recovery yet. */
export function stillOfflineKeys(episodes: Episode[]): Set<string> {
  const latest = new Map<string, Episode>();
  for (const ep of episodes) {
    const cur = latest.get(ep.screenKey);
    if (!cur || ms(ep.offlineSince) > ms(cur.offlineSince)) latest.set(ep.screenKey, ep);
  }
  return new Set([...latest.values()].filter((ep) => !ep.resolved).map((ep) => ep.key));
}

function groupOf(kind: NotificationGroup["kind"], members: Episode[], offlineNow: Set<string>): NotificationGroup {
  const sorted = [...members].sort((x, y) => ms(y.at) - ms(x.at));
  const head = sorted[0];
  const first = [...members].sort((x, y) => ms(x.offlineSince) - ms(y.offlineSince))[0];
  const allBack = members.every((m) => m.resolved);
  const lastBack = allBack ? members.reduce((acc, m) => (m.backAt && (!acc || ms(m.backAt) > ms(acc)) ? m.backAt : acc), null as string | null) : null;
  return {
    key: `${kind}:${members.map((m) => m.key).sort().join(",")}`,
    kind,
    ids: members.flatMap((m) => m.ids),
    read: members.every((m) => m.read),
    at: head.at,
    attention: members.some((m) => offlineNow.has(m.key)),
    screenId: kind === "burst" ? null : head.screenId,
    screenName: head.screenName,
    offlineSince: kind === "burst" ? first.offlineSince : head.offlineSince,
    backAt: kind === "burst" ? lastBack : head.backAt,
    offlineSeconds: head.offlineSeconds,
    count: kind === "burst" ? new Set(members.map((m) => m.screenKey)).size : members.length,
    members: sorted,
  };
}

export function groupAlerts(alerts: AlertItem[]): NotificationGroup[] {
  const episodes = toEpisodes(alerts);
  const offlineNow = stillOfflineKeys(episodes);
  const used = new Set<string>();
  const groups: NotificationGroup[] = [];

  // Bursts, oldest first so a cluster starts at its first outage.
  const byStart = [...episodes].sort((x, y) => ms(x.offlineSince) - ms(y.offlineSince));
  for (let i = 0; i < byStart.length; i++) {
    const start = byStart[i];
    if (used.has(start.key)) continue;
    const cluster = byStart.filter((ep) => !used.has(ep.key) && ms(ep.offlineSince) >= ms(start.offlineSince) && ms(ep.offlineSince) - ms(start.offlineSince) <= BURST_WINDOW_MS);
    // One episode per screen inside a burst; a screen that flapped inside 5 minutes counts once.
    const perScreen = new Map<string, Episode>();
    for (const ep of cluster) if (!perScreen.has(ep.screenKey)) perScreen.set(ep.screenKey, ep);
    if (perScreen.size >= BURST_MIN_SCREENS) {
      const members = [...perScreen.values()];
      members.forEach((m) => used.add(m.key));
      groups.push(groupOf("burst", members, offlineNow));
    }
  }

  // Flapping per screen, newest first.
  const rest = episodes.filter((ep) => !used.has(ep.key));
  const byScreen = new Map<string, Episode[]>();
  for (const ep of rest) byScreen.set(ep.screenKey, [...(byScreen.get(ep.screenKey) ?? []), ep]);
  for (const list of byScreen.values()) {
    const eps = [...list].sort((x, y) => ms(y.at) - ms(x.at));
    let i = 0;
    while (i < eps.length) {
      const window = eps.filter((ep, j) => j >= i && ms(eps[i].at) - ms(ep.at) <= FLAP_WINDOW_MS);
      if (window.length >= FLAP_MIN_EPISODES) {
        groups.push(groupOf("flap", window, offlineNow));
        i += window.length;
      } else {
        const ep = eps[i];
        groups.push(groupOf(ep.resolved ? "recovered" : "offline", [ep], offlineNow));
        i += 1;
      }
    }
  }
  return groups.sort((x, y) => ms(y.at) - ms(x.at));
}

/** Unread groups, capped for the badge. */
export function badgeText(unread: number): string | null {
  if (unread <= 0) return null;
  return unread > 9 ? "9+" : String(unread);
}

/** Splits ids into /api/alerts/read batches (the endpoint accepts at most 100 ids). */
export function readBatches(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += READ_BATCH) out.push(ids.slice(i, i + READ_BATCH));
  return out;
}

/** Day heading for the history page: Today, Yesterday, or a short date in the account language. */
export function dayLabel(iso: string, now: Date, locale: string, labels: { today: string; yesterday: string }): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff <= 0) return labels.today;
  if (diff === 1) return labels.yesterday;
  return d.toLocaleDateString(locale === "es" ? "es" : "en-US", { weekday: "long", month: "short", day: "numeric" });
}
