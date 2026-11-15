/**
 * E5-F3: after any change to screens or pairing, every open view of screens refreshes at once
 * (this tab and other tabs of the dashboard), instead of waiting for its poll or a navigation.
 */
export const SCREENS_CHANGED = "pekko:screens-changed";
const CHANNEL = "pekko-screens";
/** Gother #109 low: the window event already covers this tab, so channel messages from this tab are skipped. */
const TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Writes that change what screens show, which TV is paired, or group membership. */
export function changesScreens(path: string, method: string | undefined): boolean {
  const m = (method ?? "GET").toUpperCase();
  if (m === "GET" || m === "HEAD") return false;
  const p = path.split("?")[0]!;
  return /^\/api\/(displays|screen-groups)(\/|$)/.test(p) || /^\/api\/playlists\/[^/]+\/publish$/.test(p) || p === "/api/layout-studio/assign";
}

/** Reads that should refresh when screens change. */
export function showsScreens(path: string): boolean {
  return /^\/api\/(displays|screen-groups|alerts|overview)(\/|\?|$)/.test(path);
}

export function announceScreensChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SCREENS_CHANGED));
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ tab: TAB_ID, at: Date.now() });
    channel.close();
  } catch { /* BroadcastChannel unavailable: this tab still refreshed */ }
}

/** Subscribe to screen changes from this tab and other tabs. Returns an unsubscribe function. */
export function onScreensChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SCREENS_CHANGED, listener);
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event: MessageEvent) => { if ((event?.data as { tab?: string } | null)?.tab !== TAB_ID) listener(); };
  } catch { channel = null; }
  return () => { window.removeEventListener(SCREENS_CHANGED, listener); channel?.close(); };
}
