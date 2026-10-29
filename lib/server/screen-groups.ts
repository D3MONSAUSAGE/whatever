import { isUuid } from "./crypto";

/** Active display ids for a group. Empty input means an empty group. */
export function parseDisplayIds(input: unknown): string[] | "invalid" {
  if (input == null) return [];
  if (!Array.isArray(input)) return "invalid";
  const ids: string[] = [];
  for (const value of input) {
    if (!isUuid(value)) return "invalid";
    if (!ids.includes(value)) ids.push(value);
  }
  if (ids.length > 100) return "invalid";
  return ids;
}
