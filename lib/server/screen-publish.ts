export type PublishScreen = {
  id: string;
  name: string;
  playlistId: string | null;
  online: boolean;
  scheduleName: string | null;
  scheduleTarget: "display" | "group" | null;
};

export type PublishImpact = {
  affected: { id: string; name: string; change: "assign" }[];
  kept: { id: string; name: string }[];
  /** Screens already on this playlist that were not selected. Cleared only when replace is true. */
  willBeCleared: { id: string; name: string }[];
  overriddenBySchedule: { id: string; name: string; scheduleName: string }[];
  offline: { id: string; name: string }[];
};

/**
 * Additive publish leaves willBeCleared alone. replace:true is the only path that drops them.
 * POST /api/playlists/:id/publish still calls publish_playlist directly and can clear.
 */
export function publishImpact(playlistId: string, selected: PublishScreen[], others: PublishScreen[]): PublishImpact {
  const selectedIds = new Set(selected.map((screen) => screen.id));
  const affected: PublishImpact["affected"] = [];
  for (const screen of selected) {
    if (screen.playlistId !== playlistId) affected.push({ id: screen.id, name: screen.name, change: "assign" });
  }
  const willBeCleared = others
    .filter((screen) => screen.playlistId === playlistId && !selectedIds.has(screen.id))
    .map((screen) => ({ id: screen.id, name: screen.name }));
  const kept = others
    .filter((screen) => !selectedIds.has(screen.id) && screen.playlistId !== playlistId)
    .map((screen) => ({ id: screen.id, name: screen.name }));
  const overriddenBySchedule = selected
    .filter((screen) => screen.scheduleTarget === "display" && screen.scheduleName)
    .map((screen) => ({ id: screen.id, name: screen.name, scheduleName: screen.scheduleName as string }));
  const offline = selected.filter((screen) => !screen.online).map((screen) => ({ id: screen.id, name: screen.name }));
  return { affected, kept, willBeCleared, overriddenBySchedule, offline };
}
