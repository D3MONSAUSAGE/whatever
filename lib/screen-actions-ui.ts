import { makeT, type T } from "@/lib/i18n/index";

const EN: T = makeT("en");

export type ScreenActionId = "upload" | "change" | "create" | "playlist" | "schedule";
export type ScreenActionGroup = "primary" | "secondary" | "supporting";

/** Visual order: primary, then secondary, then supporting. */
export const SCREEN_ACTION_ORDER: ScreenActionId[] = ["change", "schedule", "playlist", "upload", "create"];

export function screenActionLabel(id: ScreenActionId, t: T = EN) {
  if (id === "change") return t("sa.change");
  if (id === "schedule") return t("sa.schedule");
  if (id === "playlist") return t("sa.playlist");
  if (id === "upload") return t("sa.upload");
  return t("sa.create");
}

export function screenActionGroup(id: ScreenActionId): ScreenActionGroup {
  if (id === "change") return "primary";
  if (id === "schedule" || id === "playlist") return "secondary";
  return "supporting";
}

export function screenActionHelper(id: ScreenActionId, t: T = EN) {
  if (id === "change") return t("sa.changeHelp");
  if (id === "schedule") return t("sa.scheduleHelp");
  if (id === "playlist") return t("sa.playlistHelp");
  if (id === "upload") return t("sa.uploadHelp");
  return t("sa.createHelp");
}

export function screenActionGroupLabel(group: ScreenActionGroup, t: T = EN) {
  if (group === "primary") return t("sa.groupPrimary");
  if (group === "secondary") return t("sa.groupSecondary");
  return t("sa.groupSupporting");
}

/** Change content is the primary action. The others stay secondary. An open panel stays pressed. */
export function screenActionClass(id: ScreenActionId, open: boolean) {
  if (id === "change") return open ? "btn btn-primary min-h-11 ring-2 ring-offset-2 ring-primary" : "btn btn-primary min-h-11";
  return open ? "btn btn-pressed min-h-11" : "btn btn-quiet min-h-11";
}

/**
 * Timing language for a publish confirm or success note.
 * Never promise an immediate update, and never treat an offline or unpaired TV as online.
 */
export function publishTimingCopy(display: { online: boolean; connected: boolean }, t: T = EN): string {
  if (!display.connected) return t("sa.timingUnpaired");
  if (!display.online) return t("sa.timingOffline");
  return t("sa.timingOnline");
}

export function publishSavedCopy(display: { online: boolean; connected: boolean }, t: T = EN): string {
  if (!display.connected) return t("sa.savedUnpaired");
  if (!display.online) return t("sa.savedOffline");
  return t("sa.savedOnline");
}

/**
 * Success copy after publishing to one or more screens.
 * If any target is offline or unpaired, it uses the saved-until-back-online wording
 * and never promises a 30-second update for those screens.
 */
export function publishSavedCopyForTargets(targets: { online: boolean; connected?: boolean }[], t: T = EN): string {
  if (targets.length === 1) {
    const target = targets[0];
    return publishSavedCopy({ online: target.online, connected: target.connected ?? true }, t);
  }
  const unpaired = targets.filter((item) => item.connected === false);
  const offline = targets.filter((item) => (item.connected ?? true) && !item.online);
  const live = targets.filter((item) => (item.connected ?? true) && item.online);
  const parts = [t("sa.assigned")];
  if (live.length) parts.push(t(live.length === 1 ? "sa.liveOne" : "sa.liveMany"));
  if (offline.length) parts.push(t(offline.length === 1 ? "sa.offlineOne" : "sa.offlineMany"));
  if (unpaired.length) parts.push(t(unpaired.length === 1 ? "sa.unpairedOne" : "sa.unpairedMany"));
  if (parts.length === 1) return t("sa.allAssigned");
  return parts.join(" ");
}
