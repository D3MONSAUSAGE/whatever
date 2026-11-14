import type { DisplayItem } from "@/lib/api";

export type ScreenChoice = { id: string; name: string; status: string; showing: boolean };

/** Screens offered after Publish (E2). Only paired screens; each says whether it already shows this board. */
export function screenChoices(displays: DisplayItem[] | null | undefined, playlistId: string | null): ScreenChoice[] {
  return (displays ?? [])
    .filter((display) => display.connected)
    .map((display) => ({
      id: display.id,
      name: display.name,
      status: display.online ? "Online" : "Offline",
      showing: Boolean(playlistId && display.playlist?.id === playlistId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Nothing is assigned until the user ticks a screen and confirms. Screens already showing the board are skipped. */
export function screensToAssign(choices: ScreenChoice[], picked: string[]): string[] {
  const allowed = new Set(choices.filter((choice) => !choice.showing).map((choice) => choice.id));
  return picked.filter((id) => allowed.has(id));
}

export const SHOW_ON_SCREENS_STYLES = `
        .show-on-screens { background: #fff; border: 1px solid #cfe0ff; border-radius: 14px; padding: 14px; margin: 10px 0; box-shadow: 0 6px 20px rgba(15, 23, 42, .06); }
        .show-on-screens h2 { margin: 0 0 4px; font-size: 16px; font-weight: 750; }
        .show-on-screens-lede { margin: 0 0 8px; font-size: 13px; color: #5c6474; }
        .show-on-screens-list { border: 0; margin: 0; padding: 0; display: grid; gap: 2px; }
        .show-on-screens-row { display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 14px; flex-wrap: wrap; }
        .show-on-screens-name { font-weight: 650; flex: 1 1 auto; min-width: 0; }
        .show-on-screens-status { font-size: 12px; color: #5c6474; }
        .show-on-screens-error { color: #b42318; font-size: 13px; font-weight: 650; margin: 6px 0 0; }
        .show-on-screens-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 8px; }
`;
