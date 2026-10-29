"use client";
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
import { EmptyState, LoadingBlock, PageHeader } from "@/components/ui";

const DAYS: { value: number; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

const ZONES = [
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

export type ScheduleFixture = {
  locations: LocationItem[];
  groups: ScreenGroupItem[];
  schedules: ScheduleItem[];
  displays: DisplayItem[];
  playlists: PlaylistSummary[];
  preview: SchedulePreview;
};

export function ScheduleScreen({ fixture }: { fixture?: ScheduleFixture }) {
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
      toast.show("This preview doesn't save.", true);
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
        title="Schedule"
        icon={<IconCalendar />}
        lede="Locations keep a timezone. Groups let one rule cover several screens. A rule plays a playlist's published slides in that timezone, and the screen's saved assignment plays whenever no rule is active."
      />
      <p className="text-sm text-muted mb-6 max-w-2xl leading-relaxed">
        A window that crosses midnight starts on the selected weekday and runs into the next morning.
        When clocks spring forward, times that don't exist are skipped. When they fall back, the repeated hour can match twice.
        If two rules overlap, a screen rule beats a group rule, then the higher priority, then the one updated most recently.
      </p>
      {blocked ? <p className="text-danger mb-4" role="alert">{blocked}</p> : null}

      <Locations
        locations={locations.data}
        error={locations.error}
        onCreate={(name, timezone) => run(async () => {
          await api("/api/locations", { method: "POST", body: JSON.stringify({ name, timezone }) });
          await locations.reload();
          toast.show("Location added");
        })}
        onSave={(id, name, timezone) => run(async () => {
          await api(`/api/locations/${id}`, { method: "PATCH", body: JSON.stringify({ name, timezone }) });
          await locations.reload();
          toast.show("Location saved");
        })}
        onDelete={(location) => run(async () => {
          if (location.displayCount) {
            toast.show("That location still has screens. Move them first.", true);
            return;
          }
          const ok = await confirm.ask({
            title: "Delete this location?",
            body: `Delete “${location.name}”? Screens that were disconnected here are detached.`,
            confirmLabel: "Delete location",
            danger: true,
          });
          if (ok !== true) return;
          await api(`/api/locations/${location.id}`, { method: "DELETE" });
          await locations.reload();
          await displays.reload();
          toast.show("Location deleted");
        })}
      />

      <Groups
        groups={groups.data}
        displays={displays.data ?? []}
        error={groups.error}
        onCreate={(name, displayIds) => run(async () => {
          await api("/api/screen-groups", { method: "POST", body: JSON.stringify({ name, displayIds }) });
          await groups.reload();
          toast.show("Group added");
        })}
        onSave={(id, name, displayIds) => run(async () => {
          await api(`/api/screen-groups/${id}`, { method: "PATCH", body: JSON.stringify({ name, displayIds }) });
          await groups.reload();
          toast.show("Group saved");
        })}
        onDelete={(group) => run(async () => {
          const ok = await confirm.ask({
            title: "Delete this group?",
            body: `Delete “${group.name}”? Schedules that target it are removed.`,
            confirmLabel: "Delete group",
            danger: true,
          });
          if (ok !== true) return;
          await api(`/api/screen-groups/${group.id}`, { method: "DELETE" });
          await groups.reload();
          await schedules.reload();
          toast.show("Group deleted");
        })}
      />

      <Rules
        schedules={schedules.data}
        displays={displays.data ?? []}
        groups={groups.data ?? []}
        playlists={playlists.data ?? []}
        error={schedules.error}
        onSnapshot={(playlistId) => run(async () => {
          await api(`/api/playlists/${playlistId}/snapshot`, { method: "POST" });
          await playlists.reload();
          toast.show("Published slides updated");
        })}
        onCreate={(body) => run(async () => {
          await api("/api/schedules", { method: "POST", body: JSON.stringify(body) });
          await schedules.reload();
          toast.show("Schedule added");
        })}
        onToggle={(schedule) => run(async () => {
          await api(`/api/schedules/${schedule.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !schedule.enabled }) });
          await schedules.reload();
          toast.show(schedule.enabled ? "Schedule paused" : "Schedule enabled");
        })}
        onDelete={(schedule) => run(async () => {
          const ok = await confirm.ask({
            title: "Delete this schedule?",
            body: `Delete “${schedule.name}”? Screens go back to their saved assignment outside any other rule.`,
            confirmLabel: "Delete schedule",
            danger: true,
          });
          if (ok !== true) return;
          await api(`/api/schedules/${schedule.id}`, { method: "DELETE" });
          await schedules.reload();
          toast.show("Schedule deleted");
        })}
      />

      <Preview
        displays={displays.data ?? []}
        fixture={fixture?.preview ?? null}
      />
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
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  return (
    <div className="mb-10">
      <h2 className="text-lg font-semibold mb-3">Locations</h2>
      <form className="card p-4 grid gap-3 mb-3" onSubmit={(event) => { event.preventDefault(); onCreate(name, timezone); setName(""); }}>
        <label className="text-sm font-semibold">Location name
          <input className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
        </label>
        <TimezoneField value={timezone} onChange={setTimezone} />
        <button type="submit" className="btn btn-primary w-fit">Add location</button>
      </form>
      {!locations ? <LoadingBlock label={error || "Loading locations…"} /> : locations.length === 0 ? (
        <EmptyState title="No locations yet">Each account starts with Main location. Add another for a second timezone.</EmptyState>
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
  const [name, setName] = useState(location.name);
  const [timezone, setTimezone] = useState(location.timezone);
  return (
    <li className="card p-4 grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{location.name}</p>
        <span className="badge">{location.displayCount} {location.displayCount === 1 ? "screen" : "screens"}</span>
      </div>
      <label className="text-sm font-semibold">Name for {location.name}
        <input className="field mt-1" aria-label={`Name for ${location.name}`} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
      </label>
      <TimezoneField label={`Timezone for ${location.name}`} value={timezone} onChange={setTimezone} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={() => onSave(location.id, name, timezone)}>Save {location.name}</button>
        <button type="button" className="btn btn-quiet text-danger" onClick={() => onDelete(location)}>Delete {location.name}</button>
      </div>
    </li>
  );
}

function TimezoneField({ value, onChange, label = "Timezone" }: { value: string; onChange: (value: string) => void; label?: string }) {
  const listId = `timezones-${label.replace(/\s+/g, "-")}`;
  return (
    <label className="text-sm font-semibold">Timezone
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
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <div className="mb-10">
      <h2 className="text-lg font-semibold mb-3">Screen groups</h2>
      <form className="card p-4 grid gap-3 mb-3" onSubmit={(event) => { event.preventDefault(); onCreate(name, picked); setName(""); setPicked([]); }}>
        <label className="text-sm font-semibold">Group name
          <input className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
        </label>
        <DisplayChecks displays={displays} picked={picked} onChange={setPicked} legend="Screens in this new group" />
        <button type="submit" className="btn btn-primary w-fit">Create group</button>
      </form>
      {!groups ? <LoadingBlock label={error || "Loading groups…"} /> : groups.length === 0 ? (
        <EmptyState title="No screen groups yet">A group is a named set of screens a schedule can target.</EmptyState>
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
  const [name, setName] = useState(group.name);
  const [picked, setPicked] = useState(group.displayIds);
  return (
    <li className="card p-4 grid gap-3">
      <label className="text-sm font-semibold">Name for {group.name}
        <input className="field mt-1" aria-label={`Name for ${group.name}`} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
      </label>
      <DisplayChecks displays={displays} picked={picked} onChange={setPicked} legend={`Screens in ${group.name}`} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={() => onSave(group.id, name, picked)}>Save {group.name}</button>
        <button type="button" className="btn btn-quiet text-danger" onClick={() => onDelete(group)}>Delete {group.name}</button>
      </div>
    </li>
  );
}

function DisplayChecks({ displays, picked, onChange, legend }: { displays: DisplayItem[]; picked: string[]; onChange: (ids: string[]) => void; legend: string }) {
  if (!displays.length) return <p className="text-sm text-muted">Connect a screen before adding it to a group.</p>;
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-semibold">{legend}</legend>
      {displays.map((display) => (
        <label key={display.id} className="flex items-center gap-2 min-h-11 text-sm">
          <input
            type="checkbox"
            checked={picked.includes(display.id)}
            aria-label={`Include ${display.name}`}
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
  schedules, displays, groups, playlists, error, onSnapshot, onCreate, onToggle, onDelete,
}: {
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

  return (
    <div className="mb-10">
      <h2 className="text-lg font-semibold mb-3">Schedules</h2>
      <form
        className="card p-4 grid gap-3 mb-3"
        onSubmit={(event) => {
          event.preventDefault();
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
        <label className="text-sm font-semibold">Schedule name
          <input className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
        </label>
        <label className="text-sm font-semibold" htmlFor="schedule-playlist">Playlist</label>
        <select id="schedule-playlist" className="field" aria-label="Playlist" value={playlistId} onChange={(event) => setPlaylistId(event.target.value)} required>
          <option value="">Choose a playlist</option>
          {playlists.map((playlist) => (
            <option key={playlist.id} value={playlist.id}>{playlist.name}{playlist.publishedAt ? "" : " (not published)"}</option>
          ))}
        </select>
        {playlistId ? (
          <div className="text-sm text-muted leading-relaxed">
            Screens play the published slides, not a draft.
            <button type="button" className="btn btn-quiet ml-2" onClick={() => onSnapshot(playlistId)}>Publish slides</button>
            {selected && !selected.publishedAt ? <span className="block mt-1">Publish slides once before this schedule can be saved. That does not assign the playlist as the everyday default.</span> : null}
          </div>
        ) : null}
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Target</legend>
          <label className="flex items-center gap-2 min-h-11 text-sm"><input type="radio" name="target" checked={target === "display"} onChange={() => setTarget("display")} /> This screen</label>
          <label className="flex items-center gap-2 min-h-11 text-sm"><input type="radio" name="target" checked={target === "group"} onChange={() => setTarget("group")} /> A group</label>
        </fieldset>
        {target === "display" ? (
          <label className="text-sm font-semibold">Screen
            <select className="field mt-1" aria-label="Screen" value={displayId} onChange={(event) => setDisplayId(event.target.value)} required>
              <option value="">Choose a screen</option>
              {displays.map((display) => <option key={display.id} value={display.id}>{display.name}</option>)}
            </select>
          </label>
        ) : (
          <label className="text-sm font-semibold">Group
            <select className="field mt-1" aria-label="Group" value={groupId} onChange={(event) => setGroupId(event.target.value)} required>
              <option value="">Choose a group</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
        )}
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Weekdays</legend>
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
                  {day.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Start time
            <input className="field mt-1" type="time" step={60} value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
          </label>
          <label className="text-sm font-semibold">End time
            <input className="field mt-1" type="time" step={60} value={endTime} onChange={(event) => { setEndTime(event.target.value); setUntilMidnight(false); }} required disabled={untilMidnight} />
          </label>
        </div>
        <label className="flex items-center gap-2 min-h-11 text-sm">
          <input type="checkbox" checked={untilMidnight} onChange={(event) => setUntilMidnight(event.target.checked)} />
          End at midnight (24:00)
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Starts on
            <input className="field mt-1" type="date" aria-label="Starts on" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
          </label>
          <label className="text-sm font-semibold">Ends on
            <input className="field mt-1" type="date" aria-label="Ends on" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} />
          </label>
        </div>
        <label className="text-sm font-semibold">Priority
          <input className="field mt-1" type="number" min={-1000} max={1000} step={1} value={priority} onChange={(event) => setPriority(event.target.value)} />
        </label>
        <p className="text-xs text-muted">Higher priority wins between two rules of the same kind. A screen rule still beats a group rule.</p>
        <button type="submit" className="btn btn-primary w-fit">Add schedule</button>
      </form>
      {!schedules ? <LoadingBlock label={error || "Loading schedules…"} /> : schedules.length === 0 ? (
        <EmptyState title="No schedules yet">The saved assignment keeps playing until a rule is active.</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="card p-4 grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{schedule.name}</p>
                <span className={`badge ${schedule.enabled ? "badge-live" : ""}`}>{schedule.enabled ? "Enabled" : "Paused"}</span>
              </div>
              <p className="text-sm">
                {schedule.playlistName} · {schedule.displayName || schedule.groupName} · {dayList(schedule.weekdays)} {schedule.startTime}–{schedule.endTime}
                {schedule.priority ? ` · priority ${schedule.priority}` : ""}
              </p>
              <p className="text-xs text-muted">{schedule.displayId ? "This screen" : "Group"}{schedule.startsOn ? ` · from ${schedule.startsOn}` : ""}{schedule.endsOn ? ` · through ${schedule.endsOn}` : ""}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-quiet" onClick={() => onToggle(schedule)}>{schedule.enabled ? `Pause ${schedule.name}` : `Enable ${schedule.name}`}</button>
                <button type="button" className="btn btn-quiet text-danger" onClick={() => onDelete(schedule)}>Delete {schedule.name}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Preview({ displays, fixture }: { displays: DisplayItem[]; fixture: SchedulePreview | null }) {
  const [displayId, setDisplayId] = useState(fixture?.displayId ?? displays[0]?.id ?? "");
  const live = useApi<SchedulePreview>(fixture || !displayId ? null : `/api/schedules/preview?displayId=${displayId}&days=7`);
  const preview = fixture && fixture.displayId === displayId ? fixture : fixture && !displayId ? fixture : live.data;
  const chosen = displays.find((display) => display.id === (preview?.displayId || displayId));
  const days = useMemo(() => groupDays(preview), [preview]);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Next 7 days</h2>
      <label className="text-sm font-semibold block mb-3">Preview screen
        <select className="field mt-1" aria-label="Preview screen" value={displayId} onChange={(event) => setDisplayId(event.target.value)}>
          <option value="">Choose a screen</option>
          {displays.map((display) => <option key={display.id} value={display.id}>{display.name}</option>)}
        </select>
      </label>
      {!displayId ? <p className="text-sm text-muted">Choose a screen to see what plays.</p> : null}
      {displayId && !preview ? <LoadingBlock label={live.error || "Loading the timeline…"} /> : null}
      {preview ? (
        <div className="grid gap-4">
          <p className="text-sm text-muted">{chosen?.name ?? "Screen"} · {preview.timezone}. {labelForDefault(preview)}. {preview.resolution}</p>
          {days.map((day) => (
            <div key={day.date} className="card p-4">
              <h3 className="font-semibold mb-2">{formatDay(day.date)}</h3>
              <div className="flex h-8 overflow-hidden rounded-lg" aria-hidden>
                {day.segments.map((segment) => (
                  <div
                    key={`${segment.start}-${segment.source}`}
                    className={segment.source === "schedule" ? "bg-primary" : "bg-line"}
                    style={{ flexGrow: Math.max(1, Date.parse(segment.end) - Date.parse(segment.start)) }}
                    title={segmentLabel(segment, preview.timezone)}
                  />
                ))}
              </div>
              <ul className="mt-3 grid gap-1">
                {day.segments.map((segment) => (
                  <li key={`${segment.start}-text`} className="text-sm">
                    <span className="tabular-nums">{clock(segment.start, preview.timezone)}–{clock(segment.end, preview.timezone)}</span>
                    {" · "}
                    {segment.source === "schedule" ? segment.scheduleName || segment.playlistName || "Scheduled" : "Saved assignment"}
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

function formatDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function segmentLabel(segment: SchedulePreview["segments"][number], timeZone: string) {
  return `${clock(segment.start, timeZone)} to ${clock(segment.end, timeZone)} ${segment.scheduleName || segment.playlistName || "Saved assignment"}`;
}

function labelForDefault(preview: SchedulePreview) {
  if (preview.defaultAssignment.playlistName) return `Saved assignment: ${preview.defaultAssignment.playlistName}`;
  if (preview.defaultAssignment.mediaName) return `Saved assignment: ${preview.defaultAssignment.mediaName}`;
  return "Saved assignment: nothing";
}

function dayList(days: number[]) {
  return DAYS.filter((day) => days.includes(day.value)).map((day) => day.label).join(" ");
}
