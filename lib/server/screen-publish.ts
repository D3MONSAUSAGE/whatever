export type PublishScreen = {
  id: string;
  name: string;
  playlistId: string | null;
  online: boolean;
  scheduleName: string | null;
  scheduleTarget: "display" | "group" | null;
};

export type PublishImpact = {
  affected: { id: string; name: string; change: "assign" | "clear" }[];
  kept: { id: string; name: string }[];
  overriddenBySchedule: { id: string; name: string; scheduleName: string }[];
  offline: { id: string; name: string }[];
};

/**
 * What publish_playlist will do. Screens on this playlist that are not selected
 * are cleared, because that is what the existing publish does. Everyone else stays.
 */
export function publishImpact(playlistId: string, selected: PublishScreen[], others: PublishScreen[]): PublishImpact {
  const selectedIds = new Set(selected.map((screen) => screen.id));
  const affected: PublishImpact["affected"] = [];
  for (const screen of selected) {
    if (screen.playlistId !== playlistId) affected.push({ id: screen.id, name: screen.name, change: "assign" });
  }
  for (const screen of others) {
    if (screen.playlistId === playlistId && !selectedIds.has(screen.id)) {
      affected.push({ id: screen.id, name: screen.name, change: "clear" });
    }
  }
  const kept = others
    .filter((screen) => !selectedIds.has(screen.id) && screen.playlistId !== playlistId)
    .map((screen) => ({ id: screen.id, name: screen.name }));
  const overriddenBySchedule = selected
    .filter((screen) => screen.scheduleTarget === "display" && screen.scheduleName)
    .map((screen) => ({ id: screen.id, name: screen.name, scheduleName: screen.scheduleName as string }));
  const offline = selected.filter((screen) => !screen.online).map((screen) => ({ id: screen.id, name: screen.name }));
  return { affected, kept, overriddenBySchedule, offline };
}
