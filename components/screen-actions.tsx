"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, useApi, type DisplayItem, type MediaItem, type PlaylistDetail, type PlaylistSummary, type ScheduleItem } from "@/lib/api";
import { browserTimeZone, formatClock12, shiftClock, shiftWeekdays, zoneLabel } from "@/lib/clock";
import { useUploads } from "@/components/uploads";
import { useConfirm } from "@/components/confirm";

type Panel = "upload" | "change" | "create" | "playlist" | "schedule" | null;

type Board = { id: string; name: string; template: string; thumbnailUrl: string | null };
type MenuRow = { id: string; name: string; playlistId: string | null };

const DEFAULT_SLIDE_MS = 10_000;

export function ScreenActions({ display, onChanged, preview = false }: { display: DisplayItem; onChanged: () => void; preview?: boolean }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uploads = useUploads();
  const confirm = useConfirm();
  const media = useApi<MediaItem[]>(!preview && (panel === "change" || panel === "playlist" || panel === "upload") ? "/api/media" : null);
  const playlists = useApi<PlaylistSummary[]>(!preview && (panel === "change" || panel === "schedule" || panel === "playlist") ? "/api/playlists" : null);
  const boards = useApi<{ boards: Board[] }>(!preview && (panel === "change" || panel === "create") ? "/api/layout-studio/boards" : null);
  const menus = useApi<{ menus: MenuRow[] }>(!preview && panel === "change" ? "/api/menus" : null);
  const wasUploading = useRef(false);
  const reloadMedia = media.reload;

  useEffect(() => {
    if (wasUploading.current && !uploads.busy) reloadMedia();
    wasUploading.current = uploads.busy;
  }, [uploads.busy, reloadMedia]);

  function open(next: Panel) {
    setPanel(next);
    setNote(null);
  }

  async function assignImage(mediaId: string) {
    const ok = await confirm.ask({
      title: "Publish this to the TV?",
      body: "This replaces the single picture on this screen. Other screens stay as they are. The TV updates within about 30 seconds.",
      confirmLabel: "Publish to TV",
    });
    if (ok !== true) return;
    setBusy(true);
    try {
      await api(`/api/displays/${display.id}`, { method: "PATCH", body: JSON.stringify({ mediaId }) });
      setNote("Assigned. TV updates within ~30 s, then this screen shows as playing.");
      onChanged();
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function commitPlaylist(playlistId: string) {
    setBusy(true);
    try {
      await api("/api/displays/publish", {
        method: "POST",
        body: JSON.stringify({ playlistId, displayIds: [display.id], commit: true, replace: false }),
      });
      setNote("Assigned. TV updates within ~30 s, then this screen shows as playing.");
      onChanged();
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function publishPlaylist(playlistId: string) {
    const preview = await api<{
      affected: { name: string }[];
      willBeCleared: { name: string }[];
      overriddenBySchedule: { name: string }[];
    }>("/api/displays/publish", {
      method: "POST",
      body: JSON.stringify({ playlistId, displayIds: [display.id], commit: false }),
    });
    const ok = await confirm.ask({
      title: "Publish to this TV?",
      body: [
        preview.affected.length ? `This screen will play it.` : "This screen already plays it. The saved draft will be published.",
        preview.willBeCleared.length ? `These other screens keep it: ${preview.willBeCleared.map((item) => item.name).join(", ")}.` : "No other screen loses this playlist.",
        preview.overriddenBySchedule.length ? "A schedule on this screen still wins until it ends." : "",
        "The TV updates within about 30 seconds.",
      ].filter(Boolean).join(" "),
      confirmLabel: "Publish to TV",
    });
    if (ok !== true) return;
    await commitPlaylist(playlistId);
  }

  async function publishFile(item: { id: string; fileName: string }) {
    const ok = await confirm.ask({
      title: "Publish this to the TV?",
      body: "Video and documents play from a playlist. This creates one for this screen and leaves other screens as they are. The TV updates within about 30 seconds.",
      confirmLabel: "Publish to TV",
    });
    if (ok !== true) return;
    setBusy(true);
    try {
      const created = await api<{ id: string }>("/api/playlists", { method: "POST", body: JSON.stringify({ name: item.fileName }) });
      await api(`/api/playlists/${created.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: item.fileName,
          defaultDurationMs: DEFAULT_SLIDE_MS,
          transition: "none",
          playbackMode: "auto",
          items: [{ mediaId: item.id, durationMs: null }],
        }),
      });
      setBusy(false);
      await commitPlaylist(created.id);
    } catch (err) {
      setNote((err as Error).message);
      setBusy(false);
    }
  }

  async function assignBoard(menuId: string) {
    const ok = await confirm.ask({
      title: "Publish this layout to the TV?",
      body: "Only this screen changes. The TV updates within about 30 seconds.",
      confirmLabel: "Publish to TV",
    });
    if (ok !== true) return;
    setBusy(true);
    try {
      await api("/api/layout-studio/assign", { method: "POST", body: JSON.stringify({ menuId, displayId: display.id }) });
      setNote("Assigned. TV updates within ~30 s, then this screen shows as playing.");
      onChanged();
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 min-w-0">
      <div className="flex flex-wrap gap-2">
        {(["upload", "change", "create", "playlist", "schedule"] as const).map((id) => (
          <button key={id} type="button" className="btn min-h-11" aria-pressed={panel === id} onClick={() => open(panel === id ? null : id)}>
            {id === "upload" ? "Add media" : id === "change" ? "Change content" : id === "create" ? "Create" : id === "playlist" ? "Edit playlist" : "Schedule"}
          </button>
        ))}
      </div>
      {note ? <p role="status" className="text-sm mt-3">{note}</p> : null}
      {panel === "upload" ? (
        <div className="card p-4 mt-3 grid gap-3">
          <p className="text-sm text-muted">Files go into this account's library. Publish them from Change content.</p>
          <label className="text-sm font-medium">Image
            <input className="block mt-1 w-full max-w-full" aria-label="Upload image" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploads.busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) uploads.enqueue([file], "image"); }} />
          </label>
          <label className="text-sm font-medium">Video
            <input className="block mt-1 w-full max-w-full" aria-label="Upload video" type="file" accept="video/mp4" disabled={uploads.busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) uploads.enqueue([file], "video"); }} />
          </label>
          <label className="text-sm font-medium">PowerPoint or PDF
            <input className="block mt-1 w-full max-w-full" aria-label="Upload document" type="file" accept=".pptx,.pdf,application/pdf" disabled={uploads.busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) uploads.enqueue([file], "presentation"); }} />
          </label>
          {uploads.busy ? <p className="text-sm">Uploading…</p> : null}
        </div>
      ) : null}
      {panel === "change" ? (
        <div className="card p-4 mt-3 grid gap-4 min-w-0">
          <PicturePicker busy={busy} items={(media.data ?? []).filter((item) => item.kind !== "video" && item.kind !== "presentation" && !item.sourceMediaId)} onPublish={(id) => assignImage(id)} />
          <Picker title="Videos and documents" empty="No videos or documents yet. A single picture is the only file a screen can play on its own." disabled={busy} items={(media.data ?? []).filter((item) => (item.kind === "video" || item.kind === "presentation") && !item.sourceMediaId)} onPick={(item) => publishFile(item)} />
          <Picker title="Playlists" empty="No playlists yet." disabled={busy} items={(playlists.data ?? []).map((item) => ({ id: item.id, fileName: item.name }))} onPick={(item) => publishPlaylist(item.id)} />
          <Picker title="Menus" empty="No menus yet." disabled={busy} items={(menus.data?.menus ?? []).filter((item) => item.playlistId && !(boards.data?.boards ?? []).some((board) => board.id === item.id)).map((item) => ({ id: item.playlistId as string, fileName: item.name }))} onPick={(item) => publishPlaylist(item.id)} />
          <Picker title="Layouts" empty={boards.error ? "Layouts are not available on this account." : "No layouts yet. Create one, then publish it from Layout Studio."} disabled={busy} items={(boards.data?.boards ?? []).map((item) => ({ id: item.id, fileName: item.name }))} onPick={(item) => assignBoard(item.id)} />
        </div>
      ) : null}
      {confirm.node}
      {panel === "create" ? (
        <div className="card p-4 mt-3 flex flex-wrap gap-2">
          <Link className="btn min-h-11" href={`/dashboard/media/layout-studio?screen=${display.id}`}>New layout</Link>
          <Link className="btn min-h-11" href="/dashboard/media/menus">New menu</Link>
          <Link className="btn min-h-11" href="/dashboard/media/promos">New promotion</Link>
          <button type="button" className="btn min-h-11" onClick={() => open("playlist")}>New playlist</button>
        </div>
      ) : null}
      {panel === "playlist" ? (
        <PlaylistEditor
          display={display}
          library={media.data ?? []}
          playlists={playlists.data ?? []}
          busy={busy}
          onPublish={publishPlaylist}
          onNote={setNote}
        />
      ) : null}
      {panel === "schedule" ? (
        <ScheduleForm display={display} playlists={playlists.data ?? []} onDone={(message) => { setNote(message); onChanged(); }} />
      ) : null}
    </div>
  );
}

function PicturePicker({ items, busy, onPublish }: {
  items: { id: string; fileName: string }[];
  busy: boolean;
  onPublish: (id: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const chosen = items.find((item) => item.id === selected);
  return (
    <div className="min-w-0">
      <h3 className="font-semibold text-sm">Pictures</h3>
      <p className="text-sm text-muted mt-1">Select a picture, then publish it to this TV.</p>
      {items.length === 0 ? <p className="text-sm text-muted mt-1">No pictures yet.</p> : (
        <ul className="mt-2 grid gap-2">
          {items.slice(0, 12).map((item) => (
            <li key={item.id}>
              <button type="button" className="btn min-h-11 w-full justify-start text-left" aria-pressed={selected === item.id} disabled={busy} onClick={() => setSelected(item.id)}>{item.fileName}</button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-primary min-h-11 mt-3" disabled={busy || !chosen} onClick={() => chosen && onPublish(chosen.id)}>Publish to TV</button>
    </div>
  );
}

function Picker({ title, empty, items, onPick, disabled }: {
  title: string;
  empty: string;
  items: { id: string; fileName: string }[];
  onPick: (item: { id: string; fileName: string }) => void;
  disabled: boolean;
}) {
  return (
    <div className="min-w-0">
      <h3 className="font-semibold text-sm">{title}</h3>
      {items.length === 0 ? <p className="text-sm text-muted mt-1">{empty}</p> : (
        <ul className="mt-2 grid gap-2">
          {items.slice(0, 12).map((item) => (
            <li key={item.id}>
              <button type="button" className="btn min-h-11 w-full justify-start text-left" disabled={disabled} onClick={() => onPick(item)}>{item.fileName}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlaylistEditor({ display, library, playlists, busy, onPublish, onNote }: {
  display: DisplayItem;
  library: MediaItem[];
  playlists: PlaylistSummary[];
  busy: boolean;
  onPublish: (playlistId: string) => Promise<void>;
  onNote: (message: string) => void;
}) {
  const [editingId, setEditingId] = useState(display.playlist?.id ?? "");
  const playlistId = editingId;
  const detail = useApi<PlaylistDetail>(playlistId ? `/api/playlists/${playlistId}` : null);
  const [rows, setRows] = useState<{ mediaId: string; durationMs: number | null; fileName: string }[] | null>(null);
  const [addId, setAddId] = useState("");
  const items = rows ?? (detail.data?.items.map((item) => ({ mediaId: item.mediaId, durationMs: item.durationMs, fileName: item.fileName })) ?? null);

  useEffect(() => { setRows(null); }, [playlistId]);

  async function createPlaylist() {
    const created = await api<{ id: string }>("/api/playlists", { method: "POST", body: JSON.stringify({ name: `${display.name} playlist` }) });
    setEditingId(created.id);
    onNote("Playlist created. Add items, then publish.");
  }

  async function save() {
    if (!playlistId || !detail.data || !items) return;
    await api(`/api/playlists/${playlistId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: detail.data.name,
        defaultDurationMs: detail.data.defaultDurationMs,
        transition: detail.data.transition,
        playbackMode: detail.data.playbackMode,
        items: items.map((item) => ({ mediaId: item.mediaId, durationMs: item.durationMs })),
      }),
    });
    onNote("Playlist draft saved. Publish to send it to this TV.");
  }

  if (!playlistId) {
    return (
      <div className="card p-4 mt-3">
        <p className="text-sm">This screen is not on a playlist. A single picture does not have slides.</p>
        <button type="button" className="btn min-h-11 mt-3" onClick={() => createPlaylist().catch((err: Error) => onNote(err.message))}>Create a playlist for this screen</button>
        {playlists.length ? <p className="text-sm text-muted mt-3">Or choose one under Change content.</p> : null}
      </div>
    );
  }
  return (
    <div className="card p-4 mt-3 grid gap-3 min-w-0">
      {!items ? <p className="text-sm">{detail.error || "Loading playlist…"}</p> : items.map((item, index) => (
        <div key={`${item.mediaId}-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto]">
          <span className="text-sm truncate self-center">{item.fileName}</span>
          <label className="text-xs">Seconds
            <input className="field w-full" aria-label={`Seconds for ${item.fileName}`} inputMode="numeric" value={item.durationMs == null ? "" : String(Math.round(item.durationMs / 1000))}
              onChange={(event) => {
                const next = event.target.value.trim();
                const seconds = Number(next);
                const durationMs = next === "" || !Number.isFinite(seconds) ? null : Math.round(seconds * 1000);
                setRows(items.map((row, i) => i === index ? { ...row, durationMs } : row));
              }} />
          </label>
          <span className="flex gap-2">
            <button type="button" className="btn min-h-11" aria-label={`Move ${item.fileName} up`} disabled={index === 0} onClick={() => {
              const next = items.slice();
              const [row] = next.splice(index, 1);
              next.splice(index - 1, 0, row);
              setRows(next);
            }}>Up</button>
            <button type="button" className="btn min-h-11" aria-label={`Remove ${item.fileName}`} onClick={() => setRows(items.filter((_, i) => i !== index))}>Remove</button>
          </span>
        </div>
      ))}
      <label className="text-sm">Add from library
        <select className="field mt-1 w-full" aria-label="Add library file" value={addId} onChange={(event) => {
          const mediaId = event.target.value;
          setAddId("");
          const file = library.find((item) => item.id === mediaId);
          if (!file || !items) return;
          setRows([...items, { mediaId, durationMs: null, fileName: file.fileName }]);
        }}>
          <option value="">Choose a file</option>
          {library.filter((item) => !item.sourceMediaId).map((item) => <option key={item.id} value={item.id}>{item.fileName}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn min-h-11" disabled={busy || !items} onClick={() => save().catch((err: Error) => onNote(err.message))}>Save draft</button>
        <button type="button" className="btn btn-primary min-h-11" disabled={busy} onClick={() => onPublish(playlistId)}>Publish to TV</button>
      </div>
    </div>
  );
}

const ZONES = ["America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "America/Phoenix", "UTC", "Europe/London"];
const DAYS = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 7, label: "Sun" },
];

function ScheduleForm({ display, playlists, onDone }: { display: DisplayItem; playlists: PlaylistSummary[]; onDone: (message: string) => void }) {
  const saved = useApi<ScheduleItem[]>("/api/schedules");
  const mine = (saved.data ?? []).filter((item) => item.displayId === display.id);
  const storedZone = display.location?.timezone || "UTC";
  const [zone, setZone] = useState(() => storedZone !== "UTC" ? storedZone : browserTimeZone());
  const [scheduleId, setScheduleId] = useState("");
  const [playlistId, setPlaylistId] = useState(display.playlist?.id ?? "");
  const [start, setStart] = useState("11:00");
  const [end, setEnd] = useState("14:00");
  const [name, setName] = useState("Screen promotion");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const opened = useRef(false);

  function load(item: ScheduleItem | null, nextZone = zone) {
    if (!item) {
      setScheduleId("");
      setName("Screen promotion");
      setPlaylistId(display.playlist?.id ?? "");
      setStart("11:00");
      setEnd("14:00");
      setWeekdays([1, 2, 3, 4, 5, 6, 7]);
      return;
    }
    const from = shiftClock(item.startTime.slice(0, 5), storedZone, nextZone);
    const until = shiftClock(item.endTime.slice(0, 5), storedZone, nextZone);
    setScheduleId(item.id);
    setName(item.name);
    setPlaylistId(item.playlistId);
    setStart(from.time);
    setEnd(until.time === "00:00" && item.endTime.startsWith("24") ? "24:00" : until.time);
    setWeekdays(shiftWeekdays(item.weekdays, from.dayDelta));
  }

  useEffect(() => {
    if (opened.current || !saved.data) return;
    opened.current = true;
    const first = saved.data.find((item) => item.displayId === display.id);
    if (first) load(first);
    // Load the saved window once. `load` closes over the zone chosen for this open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.data, display.id]);

  async function save() {
    if (!playlistId) throw new Error("Choose a playlist to schedule.");
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) throw new Error("Use times like 21:24 and 22:00.");
    try { Intl.DateTimeFormat("en-US", { timeZone: zone }); } catch { throw new Error("Use a timezone like America/Los_Angeles."); }
    const clockChanged = Boolean(display.location && zone !== display.location.timezone);
    if (clockChanged && display.location) {
      await api(`/api/locations/${display.location.id}`, { method: "PATCH", body: JSON.stringify({ timezone: zone }) });
    } else if (!display.location) {
      const created = await api<{ id: string }>("/api/locations", { method: "POST", body: JSON.stringify({ name: display.name, timezone: zone }) });
      await api(`/api/displays/${display.id}`, { method: "PATCH", body: JSON.stringify({ locationId: created.id }) });
    }
    const body = { name, playlistId, displayId: display.id, weekdays, startTime: start, endTime: end, priority: 0, enabled: true };
    try {
      if (scheduleId) await api(`/api/schedules/${scheduleId}`, { method: "PATCH", body: JSON.stringify(body) });
      else await api("/api/schedules", { method: "POST", body: JSON.stringify(body) });
    } catch (err) {
      if (clockChanged && display.location) {
        await api(`/api/locations/${display.location.id}`, { method: "PATCH", body: JSON.stringify({ timezone: display.location.timezone }) });
      }
      throw err;
    }
    onDone(`Saved ${formatClock12(start)} to ${formatClock12(end)} in ${zoneLabel(zone)}. A screen schedule wins over a group schedule while it is on. The TV plays the playlist's published slides, not an unpublished draft.`);
  }

  return (
    <form className="card p-4 mt-3 grid gap-3" onSubmit={(event) => { event.preventDefault(); save().catch((err: Error) => onDone(err.message)); }}>
      <p className="text-sm">Times are {zoneLabel(zone)}. {storedZone !== zone ? `This screen's location clock is ${storedZone}. Saving updates it, including other screens at that location.` : "This is the clock the TV uses."}</p>
      <label className="text-sm">Timezone
        <input className="field mt-1 w-full" aria-label="Timezone" list="screen-timezones" value={zone} onChange={(event) => { const next = event.target.value; setZone(next); const current = mine.find((item) => item.id === scheduleId); if (current) load(current, next); }} />
        <datalist id="screen-timezones">{ZONES.map((item) => <option key={item} value={item} />)}</datalist>
      </label>
      {mine.length ? (
        <label className="text-sm">Saved window
          <select className="field mt-1 w-full" aria-label="Saved schedule" value={scheduleId} onChange={(event) => load(mine.find((item) => item.id === event.target.value) ?? null)}>
            <option value="">New window</option>
            {mine.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      ) : null}
      <label className="text-sm">Playlist
        <select className="field mt-1 w-full" aria-label="Playlist to schedule" value={playlistId} onChange={(event) => setPlaylistId(event.target.value)}>
          <option value="">Choose a playlist</option>
          {playlists.map((item) => <option key={item.id} value={item.id}>{item.name}{item.publishedAt ? "" : " (not published)"}</option>)}
        </select>
      </label>
      <p className="text-sm text-muted">The TV plays the published slides. Unpublished changes stay in the draft until that playlist is published.</p>
      <label className="text-sm">Name
        <input className="field mt-1 w-full" aria-label="Schedule name" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        {DAYS.map((day) => {
          const on = weekdays.includes(day.value);
          return (
            <button key={day.value} type="button" className={`btn min-h-11 ${on ? "btn-primary" : ""}`} aria-pressed={on}
              onClick={() => setWeekdays(on ? weekdays.filter((value) => value !== day.value) : [...weekdays, day.value].sort((a, b) => a - b))}>
              {day.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">From
          <input className="field mt-1 w-full" aria-label="Start time" type="time" value={start === "24:00" ? "00:00" : start} onChange={(event) => setStart(event.target.value)} />
        </label>
        <label className="text-sm">Until
          <input className="field mt-1 w-full" aria-label="End time" type="time" value={end === "24:00" ? "00:00" : end} onChange={(event) => setEnd(event.target.value)} />
        </label>
      </div>
      <button type="submit" className="btn btn-primary min-h-11">{scheduleId ? "Update schedule" : "Save schedule"}</button>
    </form>
  );
}
