import { ONLINE_MS } from "@/lib/server/limits";

export type CountRow = { token_hash?: unknown; last_seen_at?: unknown };

/** Online needs a connected TV and a fresh heartbeat; a just-unpaired screen keeps a recent last_seen_at. */
export function screenCounts(rows: CountRow[], now: number) {
  let online = 0;
  let offline = 0;
  let waiting = 0;
  for (const row of rows) {
    if (!row.token_hash) {
      waiting += 1;
      continue;
    }
    const seen = row.last_seen_at ? new Date(String(row.last_seen_at)).getTime() : NaN;
    if (!Number.isNaN(seen) && now - seen < ONLINE_MS) online += 1;
    else offline += 1;
  }
  return { online, offline, waiting };
}
