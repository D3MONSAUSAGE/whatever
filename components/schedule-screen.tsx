"use client";
import { useLocale, useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n";
import { DayPartSetup } from "@/components/day-parts";
import { findOverlaps, isOvernight, isPastRange, overnightMessage, pastRangeMessage, type RuleLike } from "@/lib/schedule-checks";
import { useMemo, useState } from "react";
import {
  api,
  useApi,
  type DisplayItem,
  type LocationItem,
  type PlaylistSummary,
  type ScheduleItem,
  type SchedulePreview,
  type ScreenGroupItem,
} from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { IconCalendar } from "@/components/icons";
import { EmptyState, LoadState, PageHeader , LimitNote, atLimit } from "@/components/ui";
import { formatClock12 } from "@/lib/clock";
import { ScheduleViews } from "@/components/schedule-views";
import { orderedZones } from "@/lib/time-zones";

const DAYS = [
  { value: 1, labelKey: "day.mon" },
  { value: 2, labelKey: "day.tue" },
  { value: 3, labelKey: "day.wed" },
  { value: 4, labelKey: "day.thu" },
  { value: 5, labelKey: "day.fri" },
  { value: 6, labelKey: "day.sat" },
  { value: 7, labelKey: "day.sun" },
] as const;

const ZONE_EXTRAS = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
];
// Common US zones first, then the rest A–Z (QA U1-08).
const ZONES = orderedZones(ZONE_EXTRAS);

export type ScheduleFixture = {
  locations: LocationItem[];
  groups: ScreenGroupItem[];
  schedules: ScheduleItem[];
  displays: DisplayItem[];
  playlists: PlaylistSummary[];
  preview: SchedulePreview;
};

export function ScheduleScreen({ fixture }: { fixture?: ScheduleFixture }) {
  const t = useT();
  const liveLocations = useApi<LocationItem[]>(fixture ? null : "/api/locations");
  const liveGroups = useApi<ScreenGroupItem[]>(fixture ? null : "/api/screen-groups");
  const liveSchedules = useApi<ScheduleItem[]>(fixture ? null : "/api/schedules");
  const liveDisplays = useApi<DisplayItem[]>(fixture ? null : "/api/displays");
  const livePlaylists = useApi<PlaylistSummary[]>(fixture ? null : "/api/playlists");
  const locations = fixture ? { data: fixture.locations, error: null as string | null, reload: async () => {} } : liveLocations;
  const groups = fixture ? { data: fixture.groups, error: null as string | null, reload: async () => {} } : liveGroups;
  const schedules = fixture ? { data: fixture.schedules, error: null as string | null, reload: async () => {} } : liveSchedules;
  const displays = fixture ? { data: fixture.displays, error: null as string | null, reload: async () => {} } : liveDisplays;
  const playlists = fixture ? { data: fixture.playlists, error: null as string | null, reload: async () => {} } : livePlaylists;
  const toast = useToast();
  const confirm = useConfirm();
  const blocked = locations.error || groups.error || schedules.error;

  async function run(action: () => Promise<void>) {
    if (fixture) {
      toast.show(t("ss.previewNoSave"), true);
      return;
    }
    try {
      await action();
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }

  return (
    <section>
      <PageHeader
        title={t("ss.title")}
        icon={<IconCalendar />}
        lede={t("ss.lede")}
      />
      <p className="text-sm text-muted mb-6 max-w-2xl leading-relaxed">
        {t("ss.rulesNote")}
      </p>
      {blocked ? <p className="text-danger mb-4" role="alert">{blocked}</p> : null}

      <ScheduleViews schedules={schedules.data} displays={displays.data}>
      <Locations
        locations={locations.data}
        error={locations.error}
        onCreate={(name, timezone) => run(async () => {
          await api("/api/locations", { method: "POST", body: JSON.stringify({ name, timezone }) });
          await locations.reload();
          toast.show(t("ss.locAdded"));
        })}
        onSave={(id, name, timezone) => run(async () => {
          await api(`/api/locations/${id}`, { method: "PATCH", body: JSON.stringify({ name, timezone }) });
          await locations.reload();
          toast.show(t("ss.locSaved"));
        })}
        onDelete={(location) => run(async () => {
          if (location.displayCount) {
            toast.show(t("ss.locHasScreens"), true);
            return;
          }
          const ok = await confirm.ask({
            title: t("ss.delLocTitle"),
            body: t("ss.delLocBody", { name: location.name }),
            confirmLabel: t("ss.delLoc"),
            danger: true,
          });
          if (ok !== true) return;
          await api(`/api/locations/${location.id}`, { method: "DELETE" });
          await locations.reload();
          await displays.reload();
          toast.show(t("ss.locDeleted"));
        })}
      />

      <Groups
        groups={groups.data}
        displays={displays.data ?? []}
        error={groups.error}
        onCreate={(name, displayIds) => run(async () => {
          await api("/api/screen-groups", { method: "POST", body: JSON.stringify({ name, displayIds }) });
          await groups.reload();
          toast.show(t("ss.groupAdded"));
        })}
        onSave={(id, name, displayIds) => run(async () => {
          await api(`/api/screen-groups/${id}`, { method: "PATCH", body: JSON.stringify({ name, displayIds }) });
          await groups.reload();
          toast.show(t("ss.groupSaved"));
        })}
        onDelete={(group) => run(async () => {
          const ok = await confirm.ask({
            title: t("ss.delGroupTitle"),
            body: t("ss.delGroupBody", { name: group.name }),
            confirmLabel: t("ss.delGroup"),
            danger: true,
          });
          if (ok !== true) return;
          await api(`/api/screen-groups/${group.id}`, { method: "DELETE" });
          await groups.reload();
          await schedules.reload();
          toast.show(t("ss.groupDeleted"));
        })}
      />

      <DayPartSetup
        displays={(displays.data ?? []).filter((d) => d.connected)}
        groups={groups.data ?? []}
        playlists={playlists.data ?? []}
        schedules={schedules.data ?? []}
        ask={confirm.ask}
        preview={!!fixture}
        onSubmit={async (body) => {
          let ok = false;
          await run(async () => {
            const res = await api<{ ids: string[] }>("/api/schedules/day-parts", { method: "POST", body: JSON.stringify(body) });
            await schedules.reload();
            toast.show(`${res.ids.length} times of day added`);
            ok = true;
          });
          return ok;
        }}
      />

      <Rules
        schedules={schedules.data}
        displays={displays.data ?? []}
        groups={groups.data ?? []}
        playlists={playlists.data ?? []}
        error={schedules.error}
        ask={confirm.ask}
        onSnapshot={(playlistId) => run(async () => {
          await api(`/api/playlists/${playlistId}/snapshot`, { method: "POST" });
          await playlists.reload();
          toast.show(t("ss.publishedUpdated"));
        })}
        onCreate={(body) => run(async () => {
          await api("/api/schedules", { method: "POST", body: JSON.stringify(body) });
          await schedules.reload();
          toast.show(t("ss.schedAdded"));
        })}
        onToggle={(schedule) => run(async () => {
          await api(`/api/schedules/${schedule.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !schedule.enabled }) });
          await schedules.reload();
          toast.show(schedule.enabled ? t("ss.schedPaused") : t("ss.schedEnabled"));
        })}
        onDelete={(schedule) => run(async () => {
          const ok = await confirm.ask({
            title: t("ss.delSchedTitle"),
            body: t("ss.delSchedBody", { name: schedule.name }),
            confirmLabel: t("ss.delSched"),
            danger: true,
          });
          if (ok !== true) return;
          await api(`/api/schedules/${schedule.id}`, { method: "DELETE" });
          await schedules.reload();
          toast.show(t("ss.schedDeleted"));
        })}
      />

      <Preview
        displays={displays.data ?? []}
        fixture={fixture?.preview ?? null}
      />
      </ScheduleViews>
      {toast.node}
      {confirm.node}
    </section>
  );
}

function Locations({
  locations, error, onCreate, onSave, onDelete,
}: {
  locations: LocationItem[] | null;
  error: string | null;
  onCreate: (name: string, timezone: string) => void;
  onSave: (id: string, name: string, timezone: string) => void;
  onDelete: (location: LocationItem) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  return (
    <div className="mb-10">
      <h2 className="text-lg font-semibold mb-3">{t("ss.locations")}</h2>
      <form className="card p-4 grid gap-3 mb-3" onSubmit={(event) => { event.preventDefault(); onCreate(name, timezone); setName(""); }}>
        <label className="text-sm font-semibold">{t("ss.locationName")}
          <input className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
        </label>
        <TimezoneField value={timezone} onChange={setTimezone} />
        <LimitNote count={locations?.length} max={50} noun="locations" />
        <button type="submit" className="btn btn-primary w-fit" disabled={atLimit(locations?.length, 50)}>{t("ss.addLocation")}</button>
      </form>
      {!locations ? <LoadState error={error} label={t("ss.loadingLocations")} /> : locations.length === 0 ? (
        <EmptyState title={t("ss.noLocations")}>{t("ss.noLocationsBody")}</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {locations.map((location) => (
            <LocationRow key={location.id} location={location} onSave={onSave} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LocationRow({ location, onSave, onDelete }: { location: LocationItem; onSave: (id: string, name: string, timezone: string) => void; onDelete: (location: LocationItem) => void }) {
  const t = useT();
  const [name, setName] = useState(location.name);
  const [timezone, setTimezone] = useState(location.timezone);
  return (
    <li className="card p-4 grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{location.name}</p>
        <span className="badge">{t(location.displayCount === 1 ? "ss.screenCount" : "ss.screenCountMany", { n: location.displayCount })}</span>
      </div>
      <label className="text-sm font-semibold">{t("ss.nameFor", { name: location.name })}
        <input className="field mt-1" aria-label={t("ss.nameFor", { name: location.name })} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
      </label>
      <TimezoneField label={t("ss.timezoneFor", { name: location.name })} value={timezone} onChange={setTimezone} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={() => onSave(location.id, name, timezone)}>{t("ss.saveName", { name: location.name })}</button>
        <button type="button" className="btn btn-quiet text-danger" onClick={() => onDelete(location)}>{t("ss.deleteName", { name: location.name })}</button>
      </div>
    </li>
  );
}

function TimezoneField({ value, onChange, label: labelIn }: { value: string; onChange: (value: string) => void; label?: string }) {
  const t = useT();
  const label = labelIn ?? t("ss.timezone");
  const listId = `timezones-${label.replace(/\s+/g, "-")}`;
  return (
    <label className="text-sm font-semibold">{t("ss.timezone")}
      <input className="field mt-1" list={listId} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} required />
      <datalist id={listId}>
        {ZONES.map((zone) => <option key={zone} value={zone} />)}
      </datalist>
    </label>
  );
}

function Groups({
  groups, displays, error, onCreate, onSave, onDelete,
}: {
  groups: ScreenGroupItem[] | null;
  displays: DisplayItem[];
  error: string | null;
  onCreate: (name: string, displayIds: string[]) => void;
  onSave: (id: string, name: string, displayIds: string[]) => void;
  onDelete: (group: ScreenGroupItem) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <div className="mb-10">
      <h2 className="text-lg font-semibold mb-3">{t("ss.groups")}</h2>
      <form className="card p-4 grid gap-3 mb-3" onSubmit={(event) => { event.preventDefault(); onCreate(name, picked); setName(""); setPicked([]); }}>
        <label className="text-sm font-semibold">{t("ss.groupName")}
          <input className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
        </label>
        <DisplayChecks displays={displays} picked={picked} onChange={setPicked} legend="Screens in this new group" />
        <LimitNote count={groups?.length} max={100} noun="screen groups" />
        <button type="submit" className="btn btn-primary w-fit" disabled={atLimit(groups?.length, 100)}>{t("ss.createGroup")}</button>
      </form>
      {!groups ? <LoadState error={error} label={t("ss.loadingGroups")} /> : groups.length === 0 ? (
        <EmptyState title={t("ss.noGroups")}>{t("ss.groupsNote")}</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {groups.map((group) => (
            <GroupRow key={group.id} group={group} displays={displays} onSave={onSave} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GroupRow({
  group, displays, onSave, onDelete,
}: {
  group: ScreenGroupItem;
  displays: DisplayItem[];
  onSave: (id: string, name: string, displayIds: string[]) => void;
  onDelete: (group: ScreenGroupItem) => void;
}) {
  const t = useT();
  const [name, setName] = useState(group.name);
  const [picked, setPicked] = useState(group.displayIds);
  return (
    <li className="card p-4 grid gap-3">
      <label className="text-sm font-semibold">{t("ss.nameFor", { name: group.name })}
        <input className="field mt-1" aria-label={t("ss.nameFor", { name: group.name })} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
      </label>
      <DisplayChecks displays={displays} picked={picked} onChange={setPicked} legend={t("ss.screensIn", { name: group.name })} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={() => onSave(group.id, name, picked)}>{t("ss.saveName", { name: group.name })}</button>
        <button type="button" className="btn btn-quiet text-danger" onClick={() => onDelete(group)}>{t("ss.deleteName", { name: group.name })}</button>
      </div>
    </li>
  );
}

function DisplayChecks({ displays, picked, onChange, legend }: { displays: DisplayItem[]; picked: string[]; onChange: (ids: string[]) => void; legend: string }) {
  const t = useT();
  if (!displays.length) return <p className="text-sm text-muted">{t("ss.connectFirst")}</p>;
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-semibold">{legend}</legend>
      {displays.map((display) => (
        <label key={display.id} className="flex items-center gap-2 min-h-11 text-sm">
          <input
            type="checkbox"
            checked={picked.includes(display.id)}
            aria-label={t("ss.include", { name: display.name })}
            onChange={(event) => {
              onChange(event.target.checked ? [...picked, display.id] : picked.filter((id) => id !== display.id));
            }}
          />
          {display.name}
        </label>
      ))}
    </fieldset>
  );
}

function Rules({
  schedules, displays, groups, playlists, error, ask, onSnapshot, onCreate, onToggle, onDelete,
}: {
  ask: ReturnType<typeof useConfirm>["ask"];
  schedules: ScheduleItem[] | null;
  displays: DisplayItem[];
  groups: ScreenGroupItem[];
  playlists: PlaylistSummary[];
  error: string | null;
  onSnapshot: (playlistId: string) => void;
  onCreate: (body: Record<string, unknown>) => void;
  onToggle: (schedule: ScheduleItem) => void;
  onDelete: (schedule: ScheduleItem) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [target, setTarget] = useState<"display" | "group">("display");
  const [displayId, setDisplayId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState("11:00");
  const [endTime, setEndTime] = useState("14:00");
  const [untilMidnight, setUntilMidnight] = useState(false);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [priority, setPriority] = useState("0");
  const selected = playlists.find((playlist) => playlist.id === playlistId);
  const effectiveEnd = untilMidnight ? "24:00" : endTime;
  const draft: RuleLike = {
    name: name || "This rule",
    displayId: target === "display" ? displayId || null : null,
    groupId: target === "group" ? groupId || null : null,
    weekdays, startTime, endTime: effectiveEnd, startsOn: startsOn || null, endsOn: endsOn || null,
    priority: Number(priority) || 0,
  };
  const overnight = isOvernight(startTime, effectiveEnd);
  const past = isPastRange(endsOn || null);
  const overlaps = draft.displayId || draft.groupId ? findOverlaps(draft, schedules ?? [], groups) : [];

  return (
    <div className="mb-10">
      <h2 className="text-lg font-semibold mb-3">{t("ss.schedules")}</h2>
      <form
        className="card p-4 grid gap-3 mb-3"
        onSubmit={async (event) => {
          event.preventDefault();
          // QA B2-02 / B2-04: an overnight window or a range that already ended needs an explicit OK.
          if (overnight) {
            const ok = await ask({ title: t("ss.overnightTitle"), body: overnightMessage(startTime, effectiveEnd, t), confirmLabel: t("dp.yesOvernight") });
            if (ok !== true) return;
          }
          if (past) {
            const ok = await ask({ title: t("ss.pastTitle"), body: pastRangeMessage(endsOn, t), confirmLabel: t("ss.saveAnyway") });
            if (ok !== true) return;
          }
          onCreate({
            name,
            playlistId,
            displayId: target === "display" ? displayId : null,
            groupId: target === "group" ? groupId : null,
            weekdays,
            startTime,
            endTime: untilMidnight ? "24:00" : endTime,
            startsOn: startsOn || null,
            endsOn: endsOn || null,
            priority: Number(priority),
            enabled: true,
          });
        }}
      >
        <label className="text-sm font-semibold">{t("ss.scheduleName")}
          <input className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
        </label>
        <label className="text-sm font-semibold" htmlFor="schedule-playlist">{t("ss.playlist")}</label>
        <select id="schedule-playlist" className="field" aria-label={t("ss.playlist")} value={playlistId} onChange={(event) => setPlaylistId(event.target.value)} required>
          <option value="">{t("ss.choosePlaylist")}</option>
          {playlists.map((playlist) => (
            <option key={playlist.id} value={playlist.id}>{playlist.name}{playlist.publishedAt ? "" : " (not published)"}</option>
          ))}
        </select>
        {playlistId ? (
          <div className="text-sm text-muted leading-relaxed">
            {t("ss.publishedNote")}
            <button type="button" className="btn btn-quiet ml-2" onClick={() => onSnapshot(playlistId)}>{t("ss.publishSlides")}</button>
            {selected && !selected.publishedAt ? <span className="block mt-1">{t("ss.publishOnce")}</span> : null}
          </div>
        ) : null}
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">{t("ss.target")}</legend>
          <label className="flex items-center gap-2 min-h-11 text-sm"><input type="radio" name="target" checked={target === "display"} onChange={() => setTarget("display")} /> {t("ss.thisScreen")}</label>
          <label className="flex items-center gap-2 min-h-11 text-sm"><input type="radio" name="target" checked={target === "group"} onChange={() => setTarget("group")} /> {t("ss.aGroup")}</label>
        </fieldset>
        {target === "display" ? (
          <label className="text-sm font-semibold">{t("ss.screen")}
            <select className="field mt-1" aria-label={t("ss.screen")} value={displayId} onChange={(event) => setDisplayId(event.target.value)} required>
              <option value="">{t("ss.chooseScreen")}</option>
              {displays.map((display) => <option key={display.id} value={display.id}>{display.name}</option>)}
            </select>
          </label>
        ) : (
          <label className="text-sm font-semibold">{t("ss.group")}
            <select className="field mt-1" aria-label={t("ss.group")} value={groupId} onChange={(event) => setGroupId(event.target.value)} required>
              <option value="">{t("ss.chooseGroup")}</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
        )}
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">{t("ss.weekdays")}</legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => {
              const on = weekdays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={on}
                  className={`btn ${on ? "btn-pressed" : "btn-quiet"}`}
                  onClick={() => setWeekdays(on ? weekdays.filter((value) => value !== day.value) : [...weekdays, day.value].sort((a, b) => a - b))}
                >
                  {t(day.labelKey)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">{t("ss.startTime")}
            <input className="field mt-1" type="time" step={60} value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
          </label>
          <label className="text-sm font-semibold">{t("ss.endTime")}
            <input className="field mt-1" type="time" step={60} value={endTime} onChange={(event) => { setEndTime(event.target.value); setUntilMidnight(false); }} required disabled={untilMidnight} />
          </label>
        </div>
        <label className="flex items-center gap-2 min-h-11 text-sm">
          <input type="checkbox" checked={untilMidnight} onChange={(event) => setUntilMidnight(event.target.checked)} />
          End at midnight (24:00)
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">{t("ss.startsOn")}
            <input className="field mt-1" type="date" aria-label={t("ss.startsOn")} value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
          </label>
          <label className="text-sm font-semibold">{t("ss.endsOn")}
            <input className="field mt-1" type="date" aria-label={t("ss.endsOn")} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} />
          </label>
        </div>
        <label className="text-sm font-semibold">{t("ss.priority")}
          <input className="field mt-1" type="number" min={-1000} max={1000} step={1} value={priority} onChange={(event) => setPriority(event.target.value)} />
        </label>
        <p className="text-xs text-muted">{t("ss.priorityNote")}</p>
        {overnight ? <p className="note-warn text-sm" role="status" data-testid="schedule-overnight">{overnightMessage(startTime, effectiveEnd)}</p> : null}
        {past ? <p className="note-warn text-sm" role="status" data-testid="schedule-past">{pastRangeMessage(endsOn)}</p> : null}
        {overlaps.length ? (
          <div className="note-warn text-sm grid gap-1" role="status" data-testid="schedule-overlaps">
            {overlaps.map((item) => <p key={item.other.id ?? item.other.name}>{item.message}</p>)}
          </div>
        ) : null}
        <LimitNote count={schedules?.length} max={200} noun="schedules" />
        <button type="submit" className="btn btn-primary w-fit" disabled={atLimit(schedules?.length, 200)}>{t("ss.addSchedule")}</button>
      </form>
      {!schedules ? <LoadState error={error} label={t("ss.loadingSchedules")} /> : schedules.length === 0 ? (
        <EmptyState title={t("ss.noSchedules")}>{t("ss.noSchedulesBody")}</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="card p-4 grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{schedule.name}</p>
                <span className={`badge ${schedule.enabled ? "badge-live" : ""}`}>{schedule.enabled ? t("ss.enabled") : t("ss.paused")}</span>
              </div>
              <p className="text-sm">
                {schedule.playlistName} · {schedule.displayName || schedule.groupName} · {dayList(schedule.weekdays, t)} {formatClock12(schedule.startTime)}–{formatClock12(schedule.endTime)}
                {schedule.priority ? ` · ${t("ss.priority").toLowerCase()} ${schedule.priority}` : ""}
              </p>
              <p className="text-xs text-muted">{schedule.displayId ? t("ss.thisScreen") : t("ss.group")}{schedule.startsOn ? ` · ${t("ss.from", { date: schedule.startsOn })}` : ""}{schedule.endsOn ? ` · ${t("ss.through", { date: schedule.endsOn })}` : ""}</p>
              {schedule.enabled ? findOverlaps(schedule, schedules, groups, undefined, t).map((item) => (
                <p key={item.other.id} className="text-xs text-muted" data-testid="schedule-overlap-note">{item.message}</p>
              )) : null}
              {schedule.enabled && isPastRange(schedule.endsOn) ? <p className="text-xs text-muted">{t("ss.datesPassed")}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-quiet" onClick={() => onToggle(schedule)}>{schedule.enabled ? t("ss.pauseName", { name: schedule.name }) : t("ss.enableName", { name: schedule.name })}</button>
                <button type="button" className="btn btn-quiet text-danger" onClick={() => onDelete(schedule)}>{t("ss.deleteName", { name: schedule.name })}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Preview({ displays, fixture }: { displays: DisplayItem[]; fixture: SchedulePreview | null }) {
  const { locale, t } = useLocale();
  const [displayId, setDisplayId] = useState(fixture?.displayId ?? displays[0]?.id ?? "");
  const live = useApi<SchedulePreview>(fixture || !displayId ? null : `/api/schedules/preview?displayId=${displayId}&days=7`);
  const preview = fixture && fixture.displayId === displayId ? fixture : fixture && !displayId ? fixture : live.data;
  const chosen = displays.find((display) => display.id === (preview?.displayId || displayId));
  const days = useMemo(() => groupDays(preview), [preview]);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">{t("ss.next7")}</h2>
      <label className="text-sm font-semibold block mb-3">{t("ss.previewScreen")}
        <select className="field mt-1" aria-label={t("ss.previewScreen")} value={displayId} onChange={(event) => setDisplayId(event.target.value)}>
          <option value="">{t("ss.chooseScreen")}</option>
          {displays.map((display) => <option key={display.id} value={display.id}>{display.name}</option>)}
        </select>
      </label>
      {!displayId ? <p className="text-sm text-muted">{t("ss.chooseToSee")}</p> : null}
      {displayId && !preview ? <LoadState error={live.error} label={t("ss.loadingTimeline")} /> : null}
      {preview ? (
        <div className="grid gap-4">
          <p className="text-sm text-muted">{chosen?.name ?? t("ss.screen")} · {preview.timezone}. {labelForDefault(preview, t)}. {preview.resolution}</p>
          {days.map((day) => (
            <div key={day.date} className="card p-4">
              <h3 className="font-semibold mb-2">{formatDay(day.date, locale)}</h3>
              <div className="flex h-8 overflow-hidden rounded-lg" aria-hidden>
                {day.segments.map((segment) => (
                  <div
                    key={`${segment.start}-${segment.source}`}
                    className={segment.source === "schedule" ? "bg-primary" : "bg-line"}
                    style={{ flexGrow: Math.max(1, Date.parse(segment.end) - Date.parse(segment.start)) }}
                    title={segmentLabel(segment, preview.timezone, t)}
                  />
                ))}
              </div>
              <ul className="mt-3 grid gap-1">
                {day.segments.map((segment) => (
                  <li key={`${segment.start}-text`} className="text-sm">
                    <span className="tabular-nums">{clock(segment.start, preview.timezone)}–{clock(segment.end, preview.timezone)}</span>
                    {" · "}
                    {segment.source === "schedule" ? segment.scheduleName || segment.playlistName || t("ss.scheduled") : t("ss.saved")}
                    {segment.playlistName ? ` · ${segment.playlistName}` : segment.source === "default" && preview.defaultAssignment.mediaName ? ` · ${preview.defaultAssignment.mediaName}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function groupDays(preview: SchedulePreview | null) {
  if (!preview) return [];
  const days: { date: string; segments: SchedulePreview["segments"] }[] = [];
  for (const segment of preview.segments) {
    const last = days[days.length - 1];
    if (!last || last.date !== segment.date) days.push({ date: segment.date, segments: [segment] });
    else last.segments.push(segment);
  }
  return days;
}

function clock(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function formatDay(date: string, locale = "en") {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "es" ? "es" : "en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function segmentLabel(segment: SchedulePreview["segments"][number], timeZone: string, t: T) {
  return t("ss.segment", { start: clock(segment.start, timeZone), end: clock(segment.end, timeZone), name: segment.scheduleName || segment.playlistName || t("ss.saved") });
}

function labelForDefault(preview: SchedulePreview, t: T) {
  if (preview.defaultAssignment.playlistName) return t("ss.savedName", { name: preview.defaultAssignment.playlistName });
  if (preview.defaultAssignment.mediaName) return t("ss.savedName", { name: preview.defaultAssignment.mediaName });
  return t("ss.savedNothing");
}

function dayList(days: number[], t: T) {
  return DAYS.filter((day) => days.includes(day.value)).map((day) => t(day.labelKey)).join(" ");
}
