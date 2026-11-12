export type ScreenActionId = "upload" | "change" | "create" | "playlist" | "schedule";
export type ScreenActionGroup = "primary" | "secondary" | "supporting";

/** Visual order: primary, then secondary, then supporting. */
export const SCREEN_ACTION_ORDER: ScreenActionId[] = ["change", "schedule", "playlist", "upload", "create"];

export function screenActionLabel(id: ScreenActionId) {
  if (id === "change") return "Change content";
  if (id === "schedule") return "Schedule";
  if (id === "playlist") return "Edit playlist";
  if (id === "upload") return "Upload media";
  return "Create content";
}

export function screenActionGroup(id: ScreenActionId): ScreenActionGroup {
  if (id === "change") return "primary";
  if (id === "schedule" || id === "playlist") return "secondary";
  return "supporting";
}

export function screenActionHelper(id: ScreenActionId) {
  if (id === "change") return "Choose what this TV plays, then publish it.";
  if (id === "schedule") return "Play different content at set times.";
  if (id === "playlist") return "Edit the playlist assigned to this screen.";
  if (id === "upload") return "Files go into this account's library. Publish them from Change content.";
  return "Make a new menu board, promotion, or playlist.";
}

export function screenActionGroupLabel(group: ScreenActionGroup) {
  if (group === "primary") return "Publish to TV";
  if (group === "secondary") return "Schedule and playlists";
  return "Library";
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
export function publishTimingCopy(display: { online: boolean; connected: boolean }): string {
  if (!display.connected) {
    return "This screen is not connected yet. The assignment is saved and will play once the TV finishes pairing.";
  }
  if (!display.online) {
    return "This screen is offline. The assignment is saved, and the TV will update when it comes back online.";
  }
  return "The TV updates within about 30 seconds.";
}

export function publishSavedCopy(display: { online: boolean; connected: boolean }): string {
  if (!display.connected) return "Assigned. It will play once the TV finishes pairing.";
  if (!display.online) return "Assigned. This screen is offline, so the TV will update when it comes back online.";
  return "Assigned. The TV updates within about 30 seconds, then this screen shows as playing.";
}
