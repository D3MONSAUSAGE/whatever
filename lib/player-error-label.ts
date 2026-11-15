import { makeT, type T } from "@/lib/i18n/index";
import type { MessageKey } from "@/lib/i18n/en";

const EN: T = makeT("en");

/**
 * R13-01: the TV reports these exact English sentences (public/player.html, unchanged). The dashboard
 * shows them in the UI language. Anything else (older players, future messages) is shown as reported.
 */
export const PLAYER_ERROR_KEYS: Record<string, MessageKey> = {
  "This video stalled.": "perr.stalled",
  "This video can't play on this TV.": "perr.cantPlay",
  "This video did not start in time.": "perr.noStart",
  "This video was blocked from autoplaying.": "perr.autoplay",
  "A slide did not load and was skipped.": "perr.slideSkipped",
  "The video in this board did not start. The still image is showing.": "perr.boardStill",
};

export function playerErrorLabel(message: string, t: T = EN): string {
  const key = PLAYER_ERROR_KEYS[message.trim()];
  return key ? t(key) : message;
}
