import { isUuid } from "./crypto";
import { normalizePlaylistName } from "./validate";

/**
 * Schedule resolution in a location's IANA timezone.
 *
 * Weekdays are ISO: 1 Monday … 7 Sunday. A window is [startMinute, endMinute)
 * in local clock time. endMinute may be 1440 (24:00). When endMinute is less
 * than startMinute the window crosses midnight: it starts on a selected
 * weekday and continues into the next morning even if that morning's weekday
 * is not selected. startsOn / endsOn are inclusive local dates of the morning
 * the window started (the previous local date for the after-midnight part).
 *
 * DST (resolved with Intl, not a fixed offset):
 * - Spring-forward gap: a civil time that does not exist never matches. A
 *   window that covers the gap stays active on the instants that do exist on
 *   either side. A window that sits entirely inside the gap plays nothing.
 * - Fall-back overlap: both occurrences of a repeated local time match when
 *   that clock time is inside the window, so the window can play twice.
 *
 * Conflict order, first match wins:
 * 1. A rule whose target is the display beats a rule whose target is a group.
 * 2. Higher priority wins (default 0, range -1000…1000).
 * 3. Most recently updated wins.
 * 4. Lowest id wins, so the result is fully deterministic.
 *
 * No matching rule means the caller plays the display's current assignment.
 */

export type ScheduleTarget = "display" | "group";

export type ScheduleRule = {
  id: string;
  name: string;
  playlistId: string;
  target: ScheduleTarget;
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  startsOn: string | null;
  endsOn: string | null;
  priority: number;
  updatedAt: string;
  enabled: boolean;
};

export type TimelineSegment = {
  start: string;
  end: string;
  date: string;
  ruleId: string | null;
};

export const SCHEDULE_PRIORITY_MIN = -1000;
export const SCHEDULE_PRIORITY_MAX = 1000;
export const PREVIEW_MAX_DAYS = 14;
export const NEXT_TRANSITION_HORIZON_MS = 8 * 24 * 60 * 60 * 1000;

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formatters = new Map<string, Intl.DateTimeFormat>();

let nowFn: () => Date = () => new Date();

/** Test hook. Production always reads the real clock. */
export function setScheduleClock(next: (() => Date) | null) {
  if (next && process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    throw new Error("setScheduleClock is only available in tests");
  }
  nowFn = next ?? (() => new Date());
}

export function scheduleNow() {
  return nowFn();
}

export function isValidTimeZone(timeZone: string) {
  if (!timeZone || timeZone.length > 80) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
  date: string;
};

export function localParts(instant: Date, timeZone: string): LocalParts {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, fmt);
  }
  const parts = fmt.formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const weekday = WEEKDAY[get("weekday")] ?? 0;
  const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    year,
    month,
    day,
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday,
    date,
  };
}

export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

function previousCivil(date: string) {
  const prev = addDays(date, -1);
  const [year, month, day] = prev.split("-").map(Number);
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { date: prev, weekday: js === 0 ? 7 : js };
}

function dateInRange(date: string, startsOn: string | null, endsOn: string | null) {
  if (startsOn && date < startsOn) return false;
  if (endsOn && date > endsOn) return false;
  return true;
}

/** True when this instant should play the rule in the location timezone. */
export function ruleMatches(rule: ScheduleRule, instant: Date, timeZone: string) {
  if (!rule.enabled || rule.weekdays.length === 0) return false;
  const local = localParts(instant, timeZone);
  const minutes = local.hour * 60 + local.minute;
  const { startMinute: start, endMinute: end } = rule;
  if (end > start) {
    if (minutes < start || minutes >= end) return false;
    if (!rule.weekdays.includes(local.weekday)) return false;
    return dateInRange(local.date, rule.startsOn, rule.endsOn);
  }
  if (minutes >= start) {
    if (!rule.weekdays.includes(local.weekday)) return false;
    return dateInRange(local.date, rule.startsOn, rule.endsOn);
  }
  if (minutes < end) {
    const prev = previousCivil(local.date);
    if (!rule.weekdays.includes(prev.weekday)) return false;
    return dateInRange(prev.date, rule.startsOn, rule.endsOn);
  }
  return false;
}

export function compareRules(a: ScheduleRule, b: ScheduleRule) {
  const specificity = (a.target === "display" ? 0 : 1) - (b.target === "display" ? 0 : 1);
  if (specificity) return specificity;
  if (a.priority !== b.priority) return b.priority - a.priority;
  const updatedA = Date.parse(a.updatedAt);
  const updatedB = Date.parse(b.updatedAt);
  if (updatedA !== updatedB) return updatedB - updatedA;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Winning rule, or null when the display's saved assignment should play. */
export function resolveRule(rules: ScheduleRule[], instant: Date, timeZone: string) {
  const active = rules.filter((rule) => ruleMatches(rule, instant, timeZone));
  if (!active.length) return null;
  active.sort(compareRules);
  return active[0];
}

/**
 * Version the TV compares on each poll. The saved assignment keeps
 * content_version, so a display with no active rule is unchanged. An active
 * rule uses a stable integer derived from the rule, the playlist, and the
 * published revision. It changes when a different rule wins or that playlist
 * is published again, and it is not equal to the content version the TV was
 * showing for the default, so the existing player reloads within one poll.
 */
export function playbackVersion(
  contentVersion: number,
  active: { id: string; playlistId: string; revision: number } | null,
) {
  if (!active) return contentVersion;
  const bucket = fnv1a32(`${active.id}:${active.playlistId}`) % 1_000_000;
  const revision = Math.abs(Math.trunc(active.revision)) % 1_000_000;
  let version = 1_000_000_000_000 + bucket * 1_000_000 + revision;
  if (version === contentVersion) version += 1;
  return version;
}

function fnv1a32(text: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function offsetMs(instant: Date, timeZone: string) {
  const local = localParts(instant, timeZone);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  // Drop sub-second remainder. Otherwise the offset changes every millisecond
  // and a DST search walks the whole hour one millisecond at a time.
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return asUtc - truncated;
}

/** UTC instants whose local clock is exactly this civil minute. Empty in a gap; two during a fall-back overlap. */
export function instantsForLocal(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const guess = localAsUtc - offsetMs(new Date(localAsUtc), timeZone);
  const found = new Set<number>();
  for (const base of [guess, guess - 3_600_000, guess + 3_600_000, guess - 7_200_000, guess + 7_200_000]) {
    const refined = refineLocal(base, year, month, day, hour, minute, timeZone);
    if (refined != null) found.add(refined);
  }
  return [...found].sort((a, b) => a - b);
}

function refineLocal(seed: number, year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  let utc = seed;
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const next = target - offsetMs(new Date(utc), timeZone);
    if (next === utc) break;
    utc = next;
  }
  const local = localParts(new Date(utc), timeZone);
  if (local.year !== year || local.month !== month || local.day !== day || local.hour !== hour || local.minute !== minute || local.second !== 0) {
    return null;
  }
  return utc;
}

function dstTransitions(from: Date, until: Date, timeZone: string) {
  const out: number[] = [];
  const end = until.getTime();
  let cursor = from.getTime();
  let previous = offsetMs(new Date(cursor), timeZone);
  const step = 15 * 60 * 1000;
  while (cursor < end) {
    const next = Math.min(end, cursor + step);
    const offset = offsetMs(new Date(next), timeZone);
    if (offset !== previous) {
      let lo = cursor;
      let hi = next;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (offsetMs(new Date(mid), timeZone) === previous) lo = mid;
        else hi = mid;
      }
      out.push(hi);
      previous = offsetMs(new Date(hi), timeZone);
      cursor = hi;
      continue;
    }
    cursor = next;
  }
  return out;
}

function ruleBoundaries(rule: ScheduleRule, from: Date, until: Date, timeZone: string) {
  const startDate = addDays(localParts(from, timeZone).date, -1);
  const endDate = addDays(localParts(until, timeZone).date, 1);
  const out: number[] = [];
  for (let date = startDate, guard = 0; date <= endDate && guard < 40; date = addDays(date, 1), guard++) {
    const [year, month, day] = date.split("-").map(Number);
    out.push(...instantsForLocal(year, month, day, Math.floor(rule.startMinute / 60), rule.startMinute % 60, timeZone));
    const crosses = rule.endMinute === 1440 || rule.endMinute < rule.startMinute;
    const endDate = crosses ? addDays(date, 1) : date;
    const endMinute = rule.endMinute === 1440 ? 0 : rule.endMinute;
    const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
    out.push(...instantsForLocal(endYear, endMonth, endDay, Math.floor(endMinute / 60), endMinute % 60, timeZone));
  }
  return out;
}

function localMidnights(from: Date, until: Date, timeZone: string) {
  const startDate = localParts(from, timeZone).date;
  const endDate = localParts(new Date(until.getTime() - 1), timeZone).date;
  const out: number[] = [];
  for (let date = startDate, guard = 0; date <= endDate && guard < 40; date = addDays(date, 1), guard++) {
    const [year, month, day] = date.split("-").map(Number);
    out.push(...instantsForLocal(year, month, day, 0, 0, timeZone));
  }
  return out;
}

function candidateInstants(rules: ScheduleRule[], from: Date, until: Date, timeZone: string) {
  const times = new Set<number>([from.getTime(), until.getTime()]);
  for (const instant of dstTransitions(from, until, timeZone)) times.add(instant);
  for (const instant of localMidnights(from, until, timeZone)) times.add(instant);
  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const instant of ruleBoundaries(rule, from, until, timeZone)) times.add(instant);
  }
  return [...times].filter((instant) => instant >= from.getTime() && instant <= until.getTime()).sort((a, b) => a - b);
}

export function nextTransition(rules: ScheduleRule[], from: Date, timeZone: string, horizonMs = NEXT_TRANSITION_HORIZON_MS) {
  const until = new Date(from.getTime() + horizonMs);
  const current = resolveRule(rules, from, timeZone)?.id ?? null;
  for (const instant of candidateInstants(rules, from, until, timeZone)) {
    if (instant <= from.getTime()) continue;
    const next = resolveRule(rules, new Date(instant), timeZone)?.id ?? null;
    if (next !== current) return new Date(instant);
  }
  return null;
}

export function buildTimeline(rules: ScheduleRule[], from: Date, until: Date, timeZone: string): TimelineSegment[] {
  const points = candidateInstants(rules, from, until, timeZone);
  const segments: TimelineSegment[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const startMs = points[index];
    const endMs = points[index + 1];
    if (endMs <= startMs) continue;
    const rule = resolveRule(rules, new Date(startMs), timeZone);
    const date = localParts(new Date(startMs), timeZone).date;
    const previous = segments[segments.length - 1];
    const ruleId = rule?.id ?? null;
    if (previous && previous.ruleId === ruleId && previous.date === date) {
      previous.end = new Date(endMs).toISOString();
      continue;
    }
    segments.push({
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      date,
      ruleId,
    });
  }
  return segments;
}

export function formatMinute(minute: number) {
  if (minute === 1440) return "24:00";
  const hour = Math.floor(minute / 60);
  const mins = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** "HH:MM". 24:00 is only valid when allow24 is set (an end time). */
export function parseClock(input: unknown, allow24: boolean): number | null {
  if (typeof input !== "string" || !/^\d{2}:\d{2}$/.test(input)) return null;
  const [hourText, minuteText] = input.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (allow24 && hour === 24 && minute === 0) return 1440;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function parseWeekdays(input: unknown): number[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > 7) return null;
  const days: number[] = [];
  for (const value of input) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 7) return null;
    if (!days.includes(value)) days.push(value);
  }
  return days.length ? days : null;
}

export function parseIsoDate(input: unknown): string | null | "invalid" {
  if (input == null || input === "") return null;
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return "invalid";
  const [year, month, day] = input.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return "invalid";
  return input;
}

export function parseScheduleBody(body: Record<string, unknown>): { ok: true; value: ScheduleDraft } | { ok: false; error: string } {
  const trimmed = normalizePlaylistName(body.name);
  if (!trimmed) return { ok: false, error: "Give this schedule a name." };

  const playlistId = body.playlistId;
  if (typeof playlistId !== "string" || !isUuid(playlistId)) return { ok: false, error: "Choose a playlist." };

  const hasDisplay = body.displayId != null && body.displayId !== "";
  const hasGroup = body.groupId != null && body.groupId !== "";
  if (hasDisplay && hasGroup) return { ok: false, error: "Choose a screen or a screen group, not both." };
  if (!hasDisplay && !hasGroup) return { ok: false, error: "Choose a screen or a screen group." };
  if (hasDisplay && (typeof body.displayId !== "string" || !isUuid(body.displayId))) return { ok: false, error: "Display not found." };
  if (hasGroup && (typeof body.groupId !== "string" || !isUuid(body.groupId))) return { ok: false, error: "Screen group not found." };

  const weekdays = parseWeekdays(body.weekdays);
  if (!weekdays) return { ok: false, error: "Pick at least one weekday." };

  const startMinute = parseClock(body.startTime, false);
  const endMinute = parseClock(body.endTime, true);
  if (startMinute == null || endMinute == null) {
    return { ok: false, error: "Use times like 11:00 and 14:00. 24:00 means midnight at the end of the day." };
  }
  if (startMinute === endMinute) return { ok: false, error: "The start and end are the same. A window has to cover some time." };

  const startsOn = parseIsoDate(body.startsOn);
  const endsOn = parseIsoDate(body.endsOn);
  if (startsOn === "invalid" || endsOn === "invalid") return { ok: false, error: "Use dates like 2026-11-01, or leave them blank." };
  if (startsOn && endsOn && endsOn < startsOn) return { ok: false, error: "The end date is before the start date." };

  const priority = parsePriority(body.priority);
  if (priority === "invalid") return { ok: false, error: "Priority has to be a whole number from -1000 to 1000." };
  if (body.enabled != null && typeof body.enabled !== "boolean") return { ok: false, error: "Enabled has to be true or false." };

  return {
    ok: true,
    value: {
      name: trimmed,
      playlistId,
      displayId: hasDisplay ? String(body.displayId) : null,
      groupId: hasGroup ? String(body.groupId) : null,
      weekdays,
      startMinute,
      endMinute,
      startsOn,
      endsOn,
      priority,
      enabled: body.enabled == null ? true : Boolean(body.enabled),
    },
  };
}

function parsePriority(input: unknown): number | "invalid" {
  if (input == null) return 0;
  if (typeof input !== "number" || !Number.isInteger(input)) return "invalid";
  if (input < SCHEDULE_PRIORITY_MIN || input > SCHEDULE_PRIORITY_MAX) return "invalid";
  return input;
}

export type ScheduleDraft = {
  name: string;
  playlistId: string;
  displayId: string | null;
  groupId: string | null;
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  startsOn: string | null;
  endsOn: string | null;
  priority: number;
  enabled: boolean;
};

export function ruleFromRow(row: {
  id: string;
  name?: string;
  playlist_id: string;
  display_id: string | null;
  group_id: string | null;
  weekdays: number[];
  start_minute: number;
  end_minute: number;
  starts_on: string | null;
  ends_on: string | null;
  priority: number;
  updated_at: string;
  enabled: boolean;
}): ScheduleRule {
  return {
    id: row.id,
    name: row.name ?? "",
    playlistId: row.playlist_id,
    target: row.display_id ? "display" : "group",
    weekdays: [...row.weekdays],
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    startsOn: row.starts_on ? String(row.starts_on).slice(0, 10) : null,
    endsOn: row.ends_on ? String(row.ends_on).slice(0, 10) : null,
    priority: row.priority,
    updatedAt: row.updated_at,
    enabled: row.enabled !== false,
  };
}
