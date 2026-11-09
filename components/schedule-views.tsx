"use client";

import { useState } from "react";
import { useApi, type DisplayItem, type ScheduleItem } from "@/lib/api";
import { formatClock12 } from "@/lib/clock";

type UpcomingItem = {
  displayId: string;
  screen: string;
  timezone: string;
  start: string;
  end: string;
  date: string;
  scheduleId: string;
  scheduleName: string;
  playlistName: string;
  target: "display" | "group";
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayList(days: number[]) {
  const unique = [...new Set(days)].sort((a, b) => a - b);
  if (unique.length === 7) return "Every day";
  return unique.map((day) => DAYS[day - 1] ?? "").filter(Boolean).join(", ");
}

function clock(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true, timeZone });
  } catch {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
  }
}

export function ScheduleViews({ schedules, displays, children }: { schedules: ScheduleItem[] | null; displays: DisplayItem[] | null; children: React.ReactNode }) {
  const [tab, setTab] = useState<"upcoming" | "recurring" | "calendar" | "rules">("rules");
  return (
    <div>
      <div role="tablist" aria-label="Schedule views" className="flex flex-wrap gap-2 mb-4">
        {([
          ["upcoming", "Upcoming"],
          ["recurring", "Recurring"],
          ["calendar", "Calendar"],
          ["rules", "Rules"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`btn min-h-11 ${tab === id ? "btn-primary" : ""}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "upcoming" ? <Upcoming /> : null}
      {tab === "recurring" ? <Recurring schedules={schedules} displays={displays} /> : null}
      {tab === "calendar" ? <Calendar /> : null}
      {tab === "rules" ? children : null}
    </div>
  );
}

function Upcoming() {
  const [days, setDays] = useState<7 | 14>(14);
  const data = useApi<{ items: UpcomingItem[] }>(`/api/schedules/upcoming?days=${days}`);
  const items = data.data?.items ?? [];
  return (
    <section aria-label="Upcoming">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="font-semibold">Upcoming</h2>
        <button type="button" className="btn min-h-11" aria-pressed={days === 7} onClick={() => setDays(7)}>7 days</button>
        <button type="button" className="btn min-h-11" aria-pressed={days === 14} onClick={() => setDays(14)}>14 days</button>
      </div>
      {!data.data ? <p className="text-sm text-muted">{data.error || "Loading upcoming windows…"}</p> : items.length === 0 ? (
        <p className="text-sm text-muted">No schedule is on in the next {days} days. Screens keep their saved assignment.</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li key={`${item.scheduleId}-${item.displayId}-${item.start}`} className="card p-3 text-sm">
              <p className="font-semibold">{item.scheduleName}</p>
              <p>{item.playlistName || "Playlist"} · {item.screen} · {item.target === "group" ? "Group rule" : "This screen"}</p>
              <p className="text-muted">{item.date} · {clock(item.start, item.timezone)}–{clock(item.end, item.timezone)} · {item.timezone}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Recurring({ schedules, displays }: { schedules: ScheduleItem[] | null; displays: DisplayItem[] | null }) {
  const zoneFor = (item: ScheduleItem) => {
    const display = displays?.find((row) => row.id === item.displayId);
    return display?.location?.timezone || "Each screen's location clock";
  };
  return (
    <section aria-label="Recurring">
      <h2 className="font-semibold mb-3">Recurring</h2>
      {!schedules ? <p className="text-sm text-muted">Loading recurring windows…</p> : schedules.length === 0 ? (
        <p className="text-sm text-muted">No recurring windows yet. Add one under Rules.</p>
      ) : (
        <ul className="grid gap-2">
          {schedules.map((item) => (
            <li key={item.id} className="card p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{item.name}</p>
                <span className={`badge ${item.enabled ? "badge-live" : ""}`}>{item.enabled ? "Enabled" : "Paused"}</span>
              </div>
              <p>{item.playlistName || "Playlist"} · {item.displayName || item.groupName || "No target"} · {item.displayId ? "Screen" : "Group"}</p>
              <p>{dayList(item.weekdays)} · {formatClock12(item.startTime)}–{formatClock12(item.endTime)}</p>
              <p className="text-muted">{zoneFor(item)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Calendar() {
  const data = useApi<{ items: UpcomingItem[]; from: string }>("/api/schedules/upcoming?days=14");
  const items = data.data?.items ?? [];
  const start = data.data ? new Date(data.data.from) : new Date();
  const week = Array.from({ length: 7 }, (_, index) => addUtcDays(start, index));
  const monthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const gridStart = addUtcDays(monthStart, -((monthStart.getUTCDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, index) => addUtcDays(gridStart, index));
  const byDate = new Map<string, UpcomingItem[]>();
  for (const item of items) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }
  return (
    <section aria-label="Calendar" className="grid gap-6">
      <div>
        <h2 className="font-semibold mb-3">This week</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {week.map((day) => {
            const key = dateKey(day);
            const list = byDate.get(key) ?? [];
            return (
              <div key={key} className="card p-2 min-h-24 text-sm">
                <p className="font-semibold">{day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</p>
                {list.length === 0 ? <p className="text-muted mt-1">Assignment</p> : list.slice(0, 3).map((item) => (
                  <p key={`${item.scheduleId}-${item.displayId}-${item.start}`} className="mt-1 truncate">{item.screen}: {item.playlistName || item.scheduleName}</p>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <h2 className="font-semibold mb-3">{start.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
        <div className="grid grid-cols-7 gap-1 text-xs">
          {DAYS.map((day) => <p key={day} className="text-center text-muted font-semibold">{day}</p>)}
          {cells.map((day) => {
            const key = dateKey(day);
            const list = byDate.get(key) ?? [];
            const inMonth = day.getUTCMonth() === start.getUTCMonth();
            return (
              <div key={key} className={`min-h-16 rounded-lg border border-line p-1 ${inMonth ? "bg-white" : "opacity-50"}`}>
                <p className="font-semibold">{day.getUTCDate()}</p>
                {list.length ? <p className="text-primary truncate">{list.length === 1 ? list[0].scheduleName : `${list.length} windows`}</p> : null}
              </div>
            );
          })}
        </div>
        <p className="text-sm text-muted mt-2">The month shows the next 14 days. Days after that stay blank until a later window.</p>
      </div>
    </section>
  );
}

function addUtcDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
