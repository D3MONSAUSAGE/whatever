import type { DisplayItem } from "@/lib/api";

/** B2-06: the 6-digit pairing code from what the owner typed (spaces and dashes allowed), or null. */
export function reconnectCode(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return digits.length === 6 ? digits : null;
}

export function reconnectIntro(display: Pick<DisplayItem, "connected" | "online" | "name">): string {
  const keep = "This screen keeps its name, content, schedules and groups.";
  if (!display.connected) return `No TV is connected to “${display.name}”. On the TV, open pekkotv.com/tv and enter the code it shows here. ${keep}`;
  if (!display.online) return `If the TV for “${display.name}” now shows a pairing code (for example after a reset or a new browser), enter that code here. ${keep} The old connection stops working.`;
  return `Swapping the TV on “${display.name}”? On the new TV, open pekkotv.com/tv and enter the code it shows here. ${keep} The TV connected now is disconnected.`;
}
