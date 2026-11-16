import { RANGE_PRESETS, type RangePreset } from "@/lib/dev-analytics";

/** Days and "today" are Pacific, where Pekko is run. */
export const TIME_ZONE = "America/Los_Angeles";
export const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;

export type Range = { preset: RangePreset; from: Date; to: Date; fromDay: string; toDay: string };

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** YYYY-MM-DD of an instant, in Pacific time. */
export function pacificDay(at: Date | number | string): string {
  return dayFmt.format(new Date(at));
}

function offsetMs(at: number): number {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return wall - Math.floor(at / 1000) * 1000;
}

/** The instant a Pacific calendar day starts (handles PST/PDT). */
export function pacificMidnight(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  let at = utc - offsetMs(utc);
  at = utc - offsetMs(at);
  return new Date(at);
}

/** Adds whole calendar days to a YYYY-MM-DD. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Monday (YYYY-MM-DD) of the Pacific week containing an instant. */
export function pacificWeekStart(at: Date | number | string): string {
  const day = pacificDay(at);
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

function validDay(s: string | null): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/**
 * today / 7d / 30d / 90d end now; custom is from..to inclusive Pacific days, clamped to now.
 * Returns null for anything malformed, reversed, in the future or longer than MAX_RANGE_DAYS.
 */
export function parseRange(params: URLSearchParams, now: Date = new Date()): Range | null {
  const preset = (params.get("range") || "30d") as RangePreset;
  if (!(RANGE_PRESETS as readonly string[]).includes(preset)) return null;
  const today = pacificDay(now);
  if (preset !== "custom") {
    const span = preset === "today" ? 1 : Number(preset.replace("d", ""));
    const fromDay = addDays(today, -(span - 1));
    return { preset, from: pacificMidnight(fromDay), to: now, fromDay, toDay: today };
  }
  const fromDay = params.get("from");
  const toDay = params.get("to");
  if (!validDay(fromDay) || !validDay(toDay)) return null;
  if (fromDay > toDay || toDay > today) return null;
  const from = pacificMidnight(fromDay);
  const end = pacificMidnight(addDays(toDay, 1));
  if ((end.getTime() - from.getTime()) / DAY_MS > MAX_RANGE_DAYS + 0.1) return null;
  return { preset, from, to: end.getTime() > now.getTime() ? now : end, fromDay, toDay };
}
