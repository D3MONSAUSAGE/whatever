/** Wall-clock helpers. Schedule minutes are local to a location; the form shows another zone. */

export function browserTimeZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone || "UTC";
  } catch {
    return "UTC";
  }
}

export function zoneLabel(timeZone: string, now = new Date()) {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longGeneric" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value;
    return name ? `${name} (${timeZone})` : timeZone;
  } catch {
    return timeZone;
  }
}

type Civil = { year: number; month: number; day: number; hour: number; minute: number; date: string };

function civil(instant: Date, timeZone: string): Civil {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  return {
    year,
    month,
    day,
    hour,
    minute: Number(get("minute")),
    date: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function offsetMs(timeZone: string, instant: Date) {
  const parts = civil(instant, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return asUtc - instant.getTime();
}

function utcFromWall(date: string, hour: number, minute: number, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(timeZone, new Date(guess));
  const second = guess - offsetMs(timeZone, new Date(first));
  return new Date(second);
}

/** Move an HH:MM from one IANA zone to another. dayDelta is the civil-date change. */
export function shiftClock(time: string, fromZone: string, toZone: string, now = new Date()) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || fromZone === toZone) return { time: time.slice(0, 5), dayDelta: 0 };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return { time: time.slice(0, 5), dayDelta: 0 };
  const from = civil(now, fromZone);
  const instant = utcFromWall(from.date, hour, minute, fromZone);
  const to = civil(instant, toZone);
  const dayDelta = Math.round((Date.parse(`${to.date}T00:00:00Z`) - Date.parse(`${from.date}T00:00:00Z`)) / 86_400_000);
  return {
    time: `${String(to.hour).padStart(2, "0")}:${String(to.minute).padStart(2, "0")}`,
    dayDelta,
  };
}

/** ISO weekdays 1–7. A negative delta moves Monday back onto Sunday. */
export function shiftWeekdays(days: number[], delta: number) {
  if (!delta) return [...days];
  const next = days.map((day) => ((day - 1 + delta) % 7 + 7) % 7 + 1);
  return [...new Set(next)].sort((a, b) => a - b);
}
