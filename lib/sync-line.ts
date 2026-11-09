type SyncDisplay = {
  reportedState?: "assigned" | "acknowledged" | "playing" | "pending" | "unknown";
  online: boolean;
  connected: boolean;
  playingAt?: string | null;
};

/** Present-tense playback is only for a screen whose player is online right now. */
export function syncLine(display: SyncDisplay) {
  const offline = display.connected && !display.online;
  if (display.reportedState === "playing") {
    if (!offline) return "Playing on the TV";
    const when = display.playingAt ? ago(display.playingAt) : "";
    return when ? `Last reported playing ${when} · TV offline` : "Last reported playing · TV offline";
  }
  if (display.reportedState === "acknowledged") return offline ? "TV has the update · TV offline" : "TV has the update";
  if (display.reportedState === "assigned" || display.reportedState === "pending") {
    return offline ? "Assigned · TV offline" : "Assigned · TV updates within ~30 s";
  }
  return offline ? "Unknown · TV offline" : "The TV has not reported this version yet.";
}

function ago(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 90) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} days ago`;
}
