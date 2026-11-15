import type { DisplayItem } from "@/lib/api";

export type ScreenChoice = { id: string; name: string; status: string; showing: boolean; nowShowing: string | null };

/** Screens offered after Publish (E2). Only paired screens; each says whether it already shows this board. */
export function screenChoices(displays: DisplayItem[] | null | undefined, playlistId: string | null): ScreenChoice[] {
  return (displays ?? [])
    .filter((display) => display.connected)
    .map((display) => ({
      id: display.id,
      name: display.name,
      status: display.online ? "Online" : "Offline",
      showing: Boolean(playlistId && display.playlist?.id === playlistId),
      nowShowing: display.playlist?.name ?? display.media?.fileName ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Nothing is assigned until the user ticks a screen and confirms. Screens already showing the board are skipped. */
export function screensToAssign(choices: ScreenChoice[], picked: string[]): string[] {
  const allowed = new Set(choices.filter((choice) => !choice.showing).map((choice) => choice.id));
  return picked.filter((id) => allowed.has(id));
}

/**
 * E2b: name what each ticked screen loses, e.g. "Replaces QA Mixed Loop on QA Bar TV 2."
 * Before anything is ticked, one general line explains it.
 */
export function replaceNotes(choices: ScreenChoice[], picked: string[]): string[] {
  const ticked = choices.filter((choice) => !choice.showing && picked.includes(choice.id));
  if (!ticked.length) return ["Ticking a screen replaces what it's set to show."];
  return ticked.map((choice) => choice.nowShowing
    ? `Replaces ${choice.nowShowing} on ${choice.name}.`
    : `${choice.name} isn't set to show anything yet.`);
}

/**
 * E2b: after saving a classic board, offer the same picker only when no screen was ticked
 * and no screen already plays the board. Never for an edit opened from one screen.
 */
export function shouldOfferScreens(input: {
  fromScreen: boolean;
  tickedScreens: number;
  playlistId: string | null | undefined;
  displays: DisplayItem[] | null | undefined;
}): boolean {
  if (input.fromScreen || input.tickedScreens > 0 || !input.playlistId) return false;
  return !(input.displays ?? []).some((display) => display.connected && display.playlist?.id === input.playlistId);
}

/**
 * E2b-F1: after saving a classic board. The screen picker is offered only right after a NEW board
 * is created (and only when it's on no screen). Saving an existing board never shows the picker;
 * the toast names the screens it updates, or says it isn't on a screen yet.
 */
export function afterClassicSave(input: {
  created: boolean;
  fromScreen: boolean;
  tickedScreens: number;
  playlistId: string | null | undefined;
  displays: DisplayItem[] | null | undefined;
}): { kind: "picker" } | { kind: "updated"; screens: string[] } | { kind: "none" } {
  if (input.created) return shouldOfferScreens(input) ? { kind: "picker" } : { kind: "none" };
  if (input.fromScreen || !input.playlistId) return { kind: "none" };
  const screens = (input.displays ?? [])
    .filter((display) => display.connected && display.playlist?.id === input.playlistId)
    .map((display) => display.name)
    .sort((a, b) => a.localeCompare(b));
  return { kind: "updated", screens };
}

/** "QA Bar TV", "QA Bar TV and Patio", "A, B and C" in the UI language. */
export function screenList(names: string[], locale: string): string {
  try { return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(names); } catch { return names.join(", "); }
}

export const SHOW_ON_SCREENS_STYLES = `
        .show-on-screens { background: #fff; border: 1px solid #cfe0ff; border-radius: 14px; padding: 14px; margin: 10px 0; box-shadow: 0 6px 20px rgba(15, 23, 42, .06); }
        .show-on-screens h2 { margin: 0 0 4px; font-size: 16px; font-weight: 750; }
        .show-on-screens-lede { margin: 0 0 8px; font-size: 13px; color: #5c6474; }
        .show-on-screens-list { border: 0; margin: 0; padding: 0; display: grid; gap: 2px; }
        .show-on-screens-row { display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 14px; flex-wrap: wrap; }
        .show-on-screens-name { font-weight: 650; flex: 1 1 auto; min-width: 0; }
        .show-on-screens-status { font-size: 12px; color: #5c6474; }
        .show-on-screens-now { flex-basis: 100%; margin: -8px 0 0 26px; font-size: 12px; color: #5c6474; }
        .show-on-screens h2:focus { outline: none; }
        .show-on-screens-warn { margin: 0 0 8px; font-size: 13px; color: #7a5b00; }
        .show-on-screens-warn p { margin: 0; }
        .show-on-screens-error { color: #b42318; font-size: 13px; font-weight: 650; margin: 6px 0 0; }
        .show-on-screens-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 8px; }
`;
