import { onlineNow } from "@/lib/sync-line";

export type ScreenStatusFilter = "all" | "online" | "offline";

/** Screen search and status filter (redesign feature map #49). Client-side only; the list itself is unchanged. */
export function filterScreens<T extends { name: string; connected: boolean; online: boolean; location?: { name: string } | null }>(
  list: T[], query: string, status: ScreenStatusFilter,
): T[] {
  const q = query.trim().toLocaleLowerCase();
  return list.filter((display) => {
    if (status === "online" && !onlineNow(display)) return false;
    if (status === "offline" && onlineNow(display)) return false;
    if (!q) return true;
    return display.name.toLocaleLowerCase().includes(q) || (display.location?.name ?? "").toLocaleLowerCase().includes(q);
  });
}

/** The search bar appears once a list is long enough to need it. */
export const SCREEN_FILTER_MIN = 4;
