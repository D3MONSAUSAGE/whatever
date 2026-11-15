import { makeT, type T } from "@/lib/i18n/index";

const EN: T = makeT("en");

type SyncDisplay = {
  reportedState?: "assigned" | "acknowledged" | "playing" | "pending" | "unknown";
  online: boolean;
  connected: boolean;
  playingAt?: string | null;
};

/** Present-tense playback is only for a screen whose player is online right now. */
export function syncLine(display: SyncDisplay, t: T = EN) {
  const offline = display.connected && !display.online;
  if (display.reportedState === "playing") {
    if (!offline) return t("sync.playing");
    const when = display.playingAt ? ago(display.playingAt, t) : "";
    return when ? t("sync.lastPlayingWhen", { when }) : t("sync.lastPlaying");
  }
  if (display.reportedState === "acknowledged") return offline ? t("sync.hasUpdateOffline") : t("sync.hasUpdate");
  if (display.reportedState === "assigned" || display.reportedState === "pending") {
    return offline ? t("sync.assignedOffline") : t("sync.assigned");
  }
  return offline ? t("sync.unknownOffline") : t("sync.notReported");
}

function ago(iso: string, t: T) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 90) return t("time.justNow");
  if (seconds < 3600) return t("time.minAgo", { n: Math.round(seconds / 60) });
  if (seconds < 86400) return t("time.hAgo", { n: Math.round(seconds / 3600) });
  return t("time.daysAgo", { n: Math.round(seconds / 86400) });
}

/** Gother #109 MEDIUM: a just-unpaired screen keeps a recent last_seen_at, so "online" counts need a connected TV too. */
export function onlineNow(display: { connected: boolean; online: boolean }) {
  return display.connected && display.online;
}
