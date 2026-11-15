"use client";
import { useLocale, useT } from "@/lib/i18n/client";

import { useState } from "react";
import { useApi, type DisplayItem, type ScheduleItem } from "@/lib/api";
import { formatClock12 } from "@/lib/clock";
import type { T } from "@/lib/i18n";

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

const DAY_KEYS = ["day.mon", "day.tue", "day.wed", "day.thu", "day.fri", "day.sat", "day.sun"] as const;

function dayList(days: number[], t: T) {
  const unique = [...new Set(days)].sort((a, b) => a - b);
  if (unique.length === 7) return t("sv.everyDay");
  return unique.map((day) => (DAY_KEYS[day - 1] ? t(DAY_KEYS[day - 1]) : "")).filter(Boolean).join(", ");
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
  const t = useT();
  const [tab, setTab] = useState<"upcoming" | "recurring" | "calendar" | "rules">("rules");
  return (
    <div>
      <div role="tablist" aria-label={t("sv.tabsAria")} className="flex flex-wrap gap-2 mb-4">
        {([
          ["upcoming", "sv.upcoming"],
          ["recurring", "sv.recurring"],
          ["calendar", "sv.calendar"],
          ["rules", "sv.rules"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`btn min-h-11 ${tab === id ? "btn-primary" : ""}`} onClick={() => setTab(id)}>{t(label)}</button>
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
  const t = useT();
  const [days, setDays] = useState<7 | 14>(14);
  const data = useApi<{ items: UpcomingItem[] }>(`/api/schedules/upcoming?days=${days}`);
  const items = data.data?.items ?? [];
  return (
    <section aria-label={t("sv.upcoming")}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="font-semibold">{t("sv.upcoming")}</h2>
        <button type="button" className="btn min-h-11" aria-pressed={days === 7} onClick={() => setDays(7)}>{t("sv.d7")}</button>
        <button type="button" className="btn min-h-11" aria-pressed={days === 14} onClick={() => setDays(14)}>{t("sv.d14")}</button>
      </div>
      {!data.data ? <p className="text-sm text-muted">{data.error || t("sv.loadingUpcoming")}</p> : items.length === 0 ? (
        <p className="text-sm text-muted">{t("sv.noneUpcoming", { days })}</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li key={`${item.scheduleId}-${item.displayId}-${item.start}`} className="card p-3 text-sm">
              <p className="font-semibold">{item.scheduleName}</p>
              <p>{item.playlistName || t("sv.playlist")} · {item.screen} · {item.target === "group" ? t("sv.groupRule") : t("sv.thisScreen")}</p>
              <p className="text-muted">{item.date} · {clock(item.start, item.timezone)}–{clock(item.end, item.timezone)} · {item.timezone}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Recurring({ schedules, displays }: { schedules: ScheduleItem[] | null; displays: DisplayItem[] | null }) {
  const t = useT();
  const zoneFor = (item: ScheduleItem) => {
    const display = displays?.find((row) => row.id === item.displayId);
    return display?.location?.timezone || t("sv.zoneFallback");
  };
  return (
    <section aria-label={t("sv.recurring")}>
      <h2 className="font-semibold mb-3">{t("sv.recurring")}</h2>
      {!schedules ? <p className="text-sm text-muted">{t("sv.loadingRecurring")}</p> : schedules.length === 0 ? (
        <p className="text-sm text-muted">{t("sv.noRecurring")}</p>
      ) : (
        <ul className="grid gap-2">
          {schedules.map((item) => (
            <li key={item.id} className="card p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{item.name}</p>
                <span className={`badge ${item.enabled ? "badge-live" : ""}`}>{item.enabled ? t("sv.enabled") : t("sv.paused")}</span>
              </div>
              <p>{item.playlistName || t("sv.playlist")} · {item.displayName || item.groupName || t("sv.noTarget")} · {item.displayId ? t("sv.screen") : t("sv.group")}</p>
              <p>{dayList(item.weekdays, t)} · {formatClock12(item.startTime)}–{formatClock12(item.endTime)}</p>
              <p className="text-muted">{zoneFor(item)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Calendar() {
  const t = useT();
  const { locale } = useLocale();
  const dateLocale = locale === "es" ? "es" : undefined;
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
    <section aria-label={t("sv.calendar")} className="grid gap-6">
      <div>
        <h2 className="font-semibold mb-3">{t("sv.thisWeek")}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {week.map((day) => {
            const key = dateKey(day);
            const list = byDate.get(key) ?? [];
            return (
              <div key={key} className="card p-2 min-h-24 text-sm">
                <p className="font-semibold">{day.toLocaleDateString(dateLocale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</p>
                {list.length === 0 ? <p className="text-muted mt-1">{t("sv.assignment")}</p> : list.slice(0, 3).map((item) => (
                  <p key={`${item.scheduleId}-${item.displayId}-${item.start}`} className="mt-1 truncate">{item.screen}: {item.playlistName || item.scheduleName}</p>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <h2 className="font-semibold mb-3">{start.toLocaleDateString(dateLocale, { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
        <div className="grid grid-cols-7 gap-1 text-xs">
          {DAY_KEYS.map((day) => <p key={day} className="text-center text-muted font-semibold">{t(day)}</p>)}
          {cells.map((day) => {
            const key = dateKey(day);
            const list = byDate.get(key) ?? [];
            const inMonth = day.getUTCMonth() === start.getUTCMonth();
            return (
              <div key={key} className={`min-h-16 rounded-lg border border-line p-1 ${inMonth ? "bg-white" : "opacity-50"}`}>
                <p className="font-semibold">{day.getUTCDate()}</p>
                {list.length ? <p className="text-primary truncate">{list.length === 1 ? list[0].scheduleName : t("sv.windows", { n: list.length })}</p> : null}
              </div>
            );
          })}
        </div>
        <p className="text-sm text-muted mt-2">{t("sv.monthNote")}</p>
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
