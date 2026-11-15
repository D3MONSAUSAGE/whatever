import type { DisplayItem } from "@/lib/api";
import { makeT, type T } from "@/lib/i18n/index";

const EN: T = makeT("en");


/** B2-06: the 6-digit pairing code from what the owner typed (spaces and dashes allowed), or null. */
export function reconnectCode(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return digits.length === 6 ? digits : null;
}

export function reconnectIntro(display: Pick<DisplayItem, "connected" | "online" | "name">, t: T = EN): string {
  const keep = t("reconnect.keep");
  if (!display.connected) return t("reconnect.introNone", { name: display.name, keep });
  if (!display.online) return t("reconnect.introOffline", { name: display.name, keep });
  return t("reconnect.introSwap", { name: display.name, keep });
}
