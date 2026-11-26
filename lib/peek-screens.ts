import { onlineNow } from "@/lib/sync-line";

/**
 * Peek My Screens status (handoff 05-ROUTES "Status mapping", approved changes 1 and 2). Labels only:
 * Live = onlineNow (the same 90 s check as today), Asleep = a TV is connected but not online,
 * Waiting to pair = no TV connected yet. The data and the online check are unchanged.
 */
export type PeekScreenStatus = "live" | "asleep" | "waiting";
export type PeekScreenFilter = "all" | PeekScreenStatus;

type Screenish = { name: string; connected: boolean; online: boolean; location?: { name: string } | null };

export function peekScreenStatus(display: { connected: boolean; online: boolean }): PeekScreenStatus {
  if (!display.connected) return "waiting";
  return onlineNow(display) ? "live" : "asleep";
}

export function peekScreenCounts(list: { connected: boolean; online: boolean }[]) {
  const counts = { all: list.length, live: 0, asleep: 0, waiting: 0 };
  for (const display of list) counts[peekScreenStatus(display)] += 1;
  return counts;
}

/** Same search as lib/screen-filter (name or location, case-insensitive); the status split is the only change. */
export function filterPeekScreens<T extends Screenish>(list: T[], query: string, status: PeekScreenFilter): T[] {
  const q = query.trim().toLocaleLowerCase();
  return list.filter((display) => {
    if (status !== "all" && peekScreenStatus(display) !== status) return false;
    if (!q) return true;
    return display.name.toLocaleLowerCase().includes(q) || (display.location?.name ?? "").toLocaleLowerCase().includes(q);
  });
}
