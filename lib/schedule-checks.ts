/**
 * Client-side schedule checks (QA B2-02, B2-03, B2-04). They only warn or ask for confirmation;
 * the server rules and the TV's resolution order (lib/server/schedule.ts compareRules) are unchanged.
 */
import { formatClock12 } from "@/lib/clock";

export type RuleLike = {
  id?: string;
  name: string;
  displayId: string | null;
  groupId: string | null;
  weekdays: number[];
  startTime: string; // "HH:MM", "24:00" allowed as an end
  endTime: string;
  startsOn: string | null;
  endsOn: string | null;
  priority: number;
  enabled?: boolean;
  updatedAt?: string;
};

export type GroupLike = { id: string; displayIds: string[] };

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEK = 7 * 1440;

export function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const value = Number(match[1]) * 60 + Number(match[2]);
  return value >= 0 && value <= 1440 ? value : null;
}

/** End before start: the window crosses midnight and ends the next day. */
export function isOvernight(startTime: string, endTime: string): boolean {
  const start = minutesOf(startTime);
  const end = minutesOf(endTime);
  // Ending at 00:00 or 24:00 just means "until midnight"; nothing spills into the next day.
  if (start === null || end === null || end === 1440 || end === 0) return false;
  return end < start;
}

export function overnightMessage(startTime: string, endTime: string): string {
  return `This runs overnight: it starts at ${formatClock12(startTime)} and ends at ${formatClock12(endTime)} the next day. While it runs it replaces anything else on that screen.`;
}

/** Local calendar date (YYYY-MM-DD) in the browser. */
export function todayLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The whole date range is before today, so the rule will never play. */
export function isPastRange(endsOn: string | null, today = todayLocal()): boolean {
  return Boolean(endsOn) && (endsOn as string) < today;
}

export function pastRangeMessage(endsOn: string): string {
  return `This rule ends on ${endsOn}, which has already passed, so it will never play. Change the dates or leave "Ends on" empty.`;
}

/** Weekly [start, end) minute spans, Monday 00:00 = 0, wrapped at the end of Sunday. */
function spans(rule: RuleLike): { day: number; from: number; to: number }[] {
  const start = minutesOf(rule.startTime);
  const end = minutesOf(rule.endTime);
  if (start === null || end === null || start === end) return [];
  const out: { day: number; from: number; to: number }[] = [];
  for (const day of rule.weekdays) {
    const base = (day - 1) * 1440;
    const from = base + start;
    const to = end > start ? base + end : base + 1440 + end;
    if (to <= WEEK) out.push({ day, from, to });
    else { out.push({ day, from, to: WEEK }); out.push({ day, from: 0, to: to - WEEK }); }
  }
  return out;
}

function datesMeet(a: RuleLike, b: RuleLike): boolean {
  if (a.startsOn && b.endsOn && a.startsOn > b.endsOn) return false;
  if (b.startsOn && a.endsOn && b.startsOn > a.endsOn) return false;
  return true;
}

/** Both rules can reach the same screen: same screen, same group, or a screen rule for a member of the group. */
function sameScreens(a: RuleLike, b: RuleLike, groups: GroupLike[]): boolean {
  if (a.displayId && a.displayId === b.displayId) return true;
  if (a.groupId && a.groupId === b.groupId) return true;
  const inGroup = (displayId: string, groupId: string) => groups.find((group) => group.id === groupId)?.displayIds.includes(displayId) ?? false;
  if (a.displayId && b.groupId) return inGroup(a.displayId, b.groupId);
  if (a.groupId && b.displayId) return inGroup(b.displayId, a.groupId);
  return false;
}

/** Days (Mon…Sun) on which the two rules' windows overlap, in the order of the week. */
export function overlapDays(a: RuleLike, b: RuleLike): number[] {
  if (!datesMeet(a, b)) return [];
  const days = new Set<number>();
  for (const x of spans(a)) for (const y of spans(b)) {
    const from = Math.max(x.from, y.from);
    const to = Math.min(x.to, y.to);
    if (from < to) days.add(Math.floor(from / 1440) + 1);
  }
  return [...days].sort((p, q) => p - q);
}

/**
 * Which rule plays where they overlap, using the TV's order: a screen rule beats a group rule,
 * then higher priority, then the most recently updated (a new rule counts as newest).
 */
export function winner(a: RuleLike, b: RuleLike): { rule: RuleLike; reason: string } {
  const aScreen = Boolean(a.displayId);
  const bScreen = Boolean(b.displayId);
  if (aScreen !== bScreen) return { rule: aScreen ? a : b, reason: "a rule for one screen beats a group rule" };
  if (a.priority !== b.priority) {
    const high = a.priority > b.priority ? a : b;
    const low = high === a ? b : a;
    return { rule: high, reason: `it has priority ${high.priority} and the other has ${low.priority}` };
  }
  const aTime = a.updatedAt ? Date.parse(a.updatedAt) : Number.POSITIVE_INFINITY;
  const bTime = b.updatedAt ? Date.parse(b.updatedAt) : Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return { rule: aTime > bTime ? a : b, reason: "both have the same priority and it was changed most recently" };
  const aId = a.id ?? "";
  const bId = b.id ?? "";
  return { rule: aId <= bId ? a : b, reason: "both have the same priority and were changed at the same time" };
}

export function dayNames(days: number[]): string {
  if (days.length === 7) return "every day";
  return days.map((day) => DAY[day]).join(", ");
}

export type Overlap = { other: RuleLike; days: number[]; winsHere: boolean; message: string };

/** Overlaps between a (draft or saved) rule and the other enabled rules, with who wins. */
export function findOverlaps(rule: RuleLike, others: RuleLike[], groups: GroupLike[]): Overlap[] {
  const out: Overlap[] = [];
  for (const other of others) {
    if (other.enabled === false) continue;
    if (rule.id && other.id === rule.id) continue;
    if (!sameScreens(rule, other, groups)) continue;
    const days = overlapDays(rule, other);
    if (!days.length) continue;
    const win = winner(rule, other);
    const winsHere = win.rule === rule;
    const self = rule.id ? `“${rule.name}”` : "This rule";
    const message = winsHere
      ? `Overlaps “${other.name}” (${formatClock12(other.startTime)}–${formatClock12(other.endTime)}) on ${dayNames(days)}. ${self} plays there because ${win.reason}.`
      : `Overlaps “${other.name}” (${formatClock12(other.startTime)}–${formatClock12(other.endTime)}) on ${dayNames(days)}. “${other.name}” plays there instead because ${win.reason}.`;
    out.push({ other, days, winsHere, message });
  }
  return out;
}
