"use client";

import { useT } from "@/lib/i18n/client";
import Link from "next/link";
import { orderedZones } from "@/lib/time-zones";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useApi, type DisplayItem, type MediaItem, type PlaylistDetail, type PlaylistSummary, type ScheduleItem } from "@/lib/api";
import { browserTimeZone, formatClock12, shiftClock, shiftWeekdays, zoneLabel } from "@/lib/clock";
import { useUploads } from "@/components/uploads";
import { useConfirm } from "@/components/confirm";
import { ContentPicker } from "@/components/content-picker";
import { buildScreenPickerEntries, type PickerEntry } from "@/lib/content-picker";
import { findOverlaps, isOvernight, overnightMessage, savedOvernightOk } from "@/lib/schedule-checks";
import { FileUploadControl } from "@/components/file-upload";
import {
  SCREEN_ACTION_ORDER,
  publishSavedCopy,
  publishTimingCopy,
  screenActionClass,
  screenActionGroup,
  screenActionGroupLabel,
  screenActionHelper,
  screenActionLabel,
  type ScreenActionGroup,
} from "@/lib/screen-actions-ui";

type Panel = "upload" | "change" | "create" | "playlist" | "schedule" | null;

type Board = { id: string; name: string; template: string; thumbnailUrl: string | null };
type MenuRow = { id: string; name: string; playlistId: string | null; imageUrl?: string | null };

export type ScreenLibrary = {
  media: MediaItem[];
  playlists: PlaylistSummary[];
  boards: Board[];
  menus: MenuRow[];
};

const DEFAULT_SLIDE_MS = 10_000;
const NO_MEDIA: MediaItem[] = [];
const NO_PLAYLISTS: PlaylistSummary[] = [];
const NO_BOARDS: Board[] = [];
const NO_MENUS: MenuRow[] = [];

export function ScreenActions({ display, onChanged, preview = false, library, initialPanel = null }: {
  display: DisplayItem;
  onChanged: () => void;
  preview?: boolean;
  library?: ScreenLibrary;
  initialPanel?: Panel;
}) {
  const t = useT();
  const [panel, setPanel] = useState<Panel>(initialPanel);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uploads = useUploads();
  const confirm = useConfirm();
  const live = !preview && !library;
  const media = useApi<MediaItem[]>(live && (panel === "change" || panel === "playlist" || panel === "upload") ? "/api/media" : null);
  const playlists = useApi<PlaylistSummary[]>(live && (panel === "change" || panel === "schedule" || panel === "playlist") ? "/api/playlists" : null);
  const boards = useApi<{ boards: Board[] }>(live && (panel === "change" || panel === "create") ? "/api/layout-studio/boards" : null);
  const menus = useApi<{ menus: MenuRow[] }>(live && panel === "change" ? "/api/menus" : null);
  const mediaItems = library?.media ?? media.data ?? NO_MEDIA;
  const playlistItems = library?.playlists ?? playlists.data ?? NO_PLAYLISTS;
  const boardItems = library?.boards ?? boards.data?.boards ?? NO_BOARDS;
  const menuItems = library?.menus ?? menus.data?.menus ?? NO_MENUS;
  const pickerEntries = useMemo(() => buildScreenPickerEntries({
    media: mediaItems,
    playlists: playlistItems,
    menus: menuItems,
    layouts: boardItems,
  }), [mediaItems, playlistItems, menuItems, boardItems]);
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
      title: t("sa2.publishThis"),
      body: `${t("sa2.replacesPicture")} ${publishTimingCopy(display, t)}`,
      confirmLabel: t("sa2.publishToTv"),
    });
    if (ok !== true) return;
    setBusy(true);
    try {
      await api(`/api/displays/${display.id}`, { method: "PATCH", body: JSON.stringify({ mediaId }) });
      setNote(publishSavedCopy(display, t));
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
      setNote(publishSavedCopy(display, t));
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
      title: t("sa2.publishToThis"),
      body: [
        preview.affected.length ? t("sa2.willPlay") : t("sa2.alreadyPlays"),
        preview.willBeCleared.length ? t("sa2.othersKeep", { names: preview.willBeCleared.map((item) => item.name).join(", ") }) : t("sa2.noneLose"),
        preview.overriddenBySchedule.length ? t("sa2.scheduleWins") : "",
        publishTimingCopy(display, t),
      ].filter(Boolean).join(" "),
      confirmLabel: t("sa2.publishToTv"),
    });
    if (ok !== true) return;
    await commitPlaylist(playlistId);
  }

  async function publishFile(item: { id: string; fileName: string }) {
    const ok = await confirm.ask({
      title: t("sa2.publishThis"),
      body: `${t("sa2.filePlaylist")} ${publishTimingCopy(display, t)}`,
      confirmLabel: t("sa2.publishToTv"),
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

  function publishPickerEntry(entry: PickerEntry) {
    if (entry.category === "video" || entry.category === "presentation") {
      void publishFile({ id: entry.id, fileName: entry.fileName });
      return;
    }
    if (entry.category === "playlist" || entry.category === "menu") {
      void publishPlaylist(entry.id);
      return;
    }
    if (entry.category === "layout") void assignBoard(entry.id);
  }

  async function assignBoard(menuId: string) {
    const ok = await confirm.ask({
      title: t("sa2.publishLayout"),
      body: `${t("sa2.onlyThis")} ${publishTimingCopy(display, t)}`,
      confirmLabel: t("sa2.publishToTv"),
    });
    if (ok !== true) return;
    setBusy(true);
    try {
      await api("/api/layout-studio/assign", { method: "POST", body: JSON.stringify({ menuId, displayId: display.id }) });
      setNote(publishSavedCopy(display, t));
      onChanged();
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 min-w-0">
      <div className="grid gap-4" data-testid="screen-actions">
        {(["primary", "secondary", "supporting"] as const satisfies readonly ScreenActionGroup[]).map((group) => {
          const ids = SCREEN_ACTION_ORDER.filter((id) => screenActionGroup(id) === group);
          return (
            <div key={group} className="min-w-0">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{screenActionGroupLabel(group, t)}</h3>
              <div className="flex flex-wrap gap-2 mt-2">
                {ids.map((id) => (
                  <button key={id} type="button" className={screenActionClass(id, panel === id)} aria-pressed={panel === id} onClick={() => open(panel === id ? null : id)}>
                    {screenActionLabel(id, t)}
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted mt-1">{ids.map((id) => panel === id ? screenActionHelper(id, t) : null).find(Boolean) ?? (group === "primary" ? screenActionHelper("change", t) : null)}</p>
            </div>
          );
        })}
      </div>
      {note ? <p role="status" className="text-sm mt-3">{note}</p> : null}
      {panel === "upload" ? (
        <div className="card p-4 mt-3 grid gap-4">
          <p className="text-sm text-muted">{screenActionHelper("upload", t)}</p>
          <FileUploadControl kind="image" disabled={uploads.busy} onFiles={(files) => uploads.enqueue(files, "image")} />
          <FileUploadControl kind="video" disabled={uploads.busy} onFiles={(files) => uploads.enqueue(files, "video")} />
          <FileUploadControl kind="document" disabled={uploads.busy} onFiles={(files) => uploads.enqueue(files, "presentation")} />
          {uploads.busy ? <p className="text-sm">{t("sa2.uploading")}</p> : null}
        </div>
      ) : null}
      {panel === "change" ? (
        <div className="card p-4 mt-3 grid gap-4 min-w-0">
          <ContentPicker
            busy={busy}
            entries={pickerEntries}
            layoutsUnavailable={Boolean(boards.error)}
            onPublishPicture={(id) => assignImage(id)}
            onPublish={(entry) => publishPickerEntry(entry)}
          />
        </div>
      ) : null}
      {confirm.node}
      {panel === "create" ? (
        <div className="card p-4 mt-3 flex flex-wrap gap-2">
          <p className="text-sm text-muted w-full">{screenActionHelper("create", t)}</p>
          <Link className="btn btn-quiet min-h-11" href={`/dashboard/media/menus?screen=${display.id}&new=1`}>{t("sa2.newBoard")}</Link>
          <Link className="btn btn-quiet min-h-11" href="/dashboard/media/promos?new=1" data-testid="create-promotion">{t("sa2.newPromo")}</Link>
          <button type="button" className="btn btn-quiet min-h-11" onClick={() => open("playlist")}>{t("sa2.newPlaylist")}</button>
        </div>
      ) : null}
      {panel === "playlist" ? (
        <PlaylistEditor
          display={display}
          library={mediaItems}
          playlists={playlistItems}
          busy={busy}
          onPublish={publishPlaylist}
          onNote={setNote}
        />
      ) : null}
      {panel === "schedule" ? (
        <ScheduleForm display={display} playlists={playlistItems} onDone={(message) => { setNote(message); onChanged(); }} />
      ) : null}
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
  const t = useT();
  const [editingId, setEditingId] = useState(display.playlist?.id ?? "");
  const playlistId = editingId;
  const detail = useApi<PlaylistDetail>(playlistId ? `/api/playlists/${playlistId}` : null);
  const [rows, setRows] = useState<{ mediaId: string; durationMs: number | null; fileName: string }[] | null>(null);
  const [addId, setAddId] = useState("");
  const items = rows ?? (detail.data?.items.map((item) => ({ mediaId: item.mediaId, durationMs: item.durationMs, fileName: item.fileName })) ?? null);

  useEffect(() => { setRows(null); }, [playlistId]);

  async function createPlaylist() {
    const created = await api<{ id: string }>("/api/playlists", { method: "POST", body: JSON.stringify({ name: t("sa2.screenPlaylist", { name: display.name }) }) });
    setEditingId(created.id);
    onNote(t("sa2.created"));
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
    onNote(t("sa2.draftSaved"));
  }

  if (!playlistId) {
    return (
      <div className="card p-4 mt-3">
        <p className="text-sm">{t("sa2.noPlaylist")}</p>
        <button type="button" className="btn btn-quiet min-h-11 mt-3" onClick={() => createPlaylist().catch((err: Error) => onNote(err.message))}>{t("sa2.createPlaylist")}</button>
        {playlists.length ? <p className="text-sm text-muted mt-3">{t("sa2.orChoose")}</p> : null}
      </div>
    );
  }
  return (
    <div className="card p-4 mt-3 grid gap-3 min-w-0">
      {!items ? <p className="text-sm">{detail.error || t("sa2.loadingPlaylist")}</p> : items.map((item, index) => (
        <div key={`${item.mediaId}-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto]">
          <span className="text-sm truncate self-center">{item.fileName}</span>
          <label className="text-xs">{t("sa2.seconds")}
            <input className="field w-full" aria-label={t("sa2.secondsFor", { name: item.fileName })} inputMode="numeric" value={item.durationMs == null ? "" : String(Math.round(item.durationMs / 1000))}
              onChange={(event) => {
                const next = event.target.value.trim();
                const seconds = Number(next);
                const durationMs = next === "" || !Number.isFinite(seconds) ? null : Math.round(seconds * 1000);
                setRows(items.map((row, i) => i === index ? { ...row, durationMs } : row));
              }} />
          </label>
          <span className="flex gap-2">
            <button type="button" className="btn btn-quiet min-h-11" aria-label={t("sa2.moveUp", { name: item.fileName })} disabled={index === 0} onClick={() => {
              const next = items.slice();
              const [row] = next.splice(index, 1);
              next.splice(index - 1, 0, row);
              setRows(next);
            }}>{t("sa2.up")}</button>
            <button type="button" className="btn btn-quiet text-danger min-h-11" aria-label={t("sa2.removeName", { name: item.fileName })} onClick={() => setRows(items.filter((_, i) => i !== index))}>{t("sa2.remove")}</button>
          </span>
        </div>
      ))}
      <label className="text-sm">{t("sa2.addFromLibrary")}
        <select className="field mt-1 w-full" aria-label={t("sa2.addLibraryAria")} value={addId} onChange={(event) => {
          const mediaId = event.target.value;
          setAddId("");
          const file = library.find((item) => item.id === mediaId);
          if (!file || !items) return;
          setRows([...items, { mediaId, durationMs: null, fileName: file.fileName }]);
        }}>
          <option value="">{t("sa2.chooseFile")}</option>
          {library.filter((item) => !item.sourceMediaId).map((item) => <option key={item.id} value={item.id}>{item.fileName}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-quiet min-h-11" disabled={busy || !items} onClick={() => save().catch((err: Error) => onNote(err.message))}>{t("sa2.saveDraft")}</button>
        <button type="button" className="btn btn-primary min-h-11" disabled={busy} onClick={() => onPublish(playlistId)}>{t("sa2.publishToTv")}</button>
      </div>
    </div>
  );
}

// Common US zones first, then the rest A–Z (QA U1-08).
const ZONES = orderedZones(["Europe/London"]);
const DAYS = [
  { value: 1, labelKey: "day.mon" }, { value: 2, labelKey: "day.tue" }, { value: 3, labelKey: "day.wed" },
  { value: 4, labelKey: "day.thu" }, { value: 5, labelKey: "day.fri" }, { value: 6, labelKey: "day.sat" }, { value: 7, labelKey: "day.sun" },
] as const;

function ScheduleForm({ display, playlists, onDone }: { display: DisplayItem; playlists: PlaylistSummary[]; onDone: (message: string) => void }) {
  const t = useT();
  const saved = useApi<ScheduleItem[]>("/api/schedules");
  const mine = (saved.data ?? []).filter((item) => item.displayId === display.id);
  const storedZone = display.location?.timezone || "UTC";
  const [zone, setZone] = useState(() => storedZone !== "UTC" ? storedZone : browserTimeZone());
  const [scheduleId, setScheduleId] = useState("");
  const [playlistId, setPlaylistId] = useState(display.playlist?.id ?? "");
  const [start, setStart] = useState("11:00");
  const [end, setEnd] = useState("14:00");
  const [name, setName] = useState(() => t("sa2.defaultName"));
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [overnightOk, setOvernightOk] = useState(false);
  const opened = useRef(false);
  // QA B2-02 / B2-03: overnight windows need an explicit tick; overlaps say which rule plays.
  const overnight = isOvernight(start, end);
  const overlaps = zone === storedZone
    ? findOverlaps({ id: scheduleId || undefined, name: name || t("sa2.thisRule"), displayId: display.id, groupId: null, weekdays, startTime: start, endTime: end, startsOn: null, endsOn: null, priority: 0 }, saved.data ?? [], [], undefined, t)
    : [];

  function load(item: ScheduleItem | null, nextZone = zone) {
    if (!item) {
      setScheduleId("");
      setName(t("sa2.defaultName"));
      setPlaylistId(display.playlist?.id ?? "");
      setStart("11:00");
      setEnd("14:00");
      setWeekdays([1, 2, 3, 4, 5, 6, 7]);
      setOvernightOk(false);
      return;
    }
    const from = shiftClock(item.startTime.slice(0, 5), storedZone, nextZone);
    const until = shiftClock(item.endTime.slice(0, 5), storedZone, nextZone);
    setScheduleId(item.id);
    setName(item.name);
    setPlaylistId(item.playlistId);
    setStart(from.time);
    const endShown = until.time === "00:00" && item.endTime.startsWith("24") ? "24:00" : until.time;
    setEnd(endShown);
    setWeekdays(shiftWeekdays(item.weekdays, from.dayDelta));
    // A rule that was already saved as overnight was confirmed then; name or playlist edits must not ask again.
    setOvernightOk(savedOvernightOk(from.time, endShown));
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
    if (!playlistId) throw new Error(t("sa2.needPlaylist"));
    if (overnight && !overnightOk) throw new Error(t("sa2.overnightTick"));
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) throw new Error(t("sa2.timesLike"));
    try { Intl.DateTimeFormat("en-US", { timeZone: zone }); } catch { throw new Error(t("sa2.zoneLike")); }
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
    onDone(t("sa2.saved", { start: formatClock12(start), end: formatClock12(end), zone: zoneLabel(zone) }));
  }

  return (
    <form className="card p-4 mt-3 grid gap-3" onSubmit={(event) => { event.preventDefault(); save().catch((err: Error) => onDone(err.message)); }}>
      <p className="text-sm">{t("sa2.timesAre", { zone: zoneLabel(zone) })} {storedZone !== zone ? t("sa2.clockIs", { zone: storedZone }) : t("sa2.tvClock")}</p>
      <label className="text-sm">{t("sa2.timezone")}
        <input className="field mt-1 w-full" aria-label={t("sa2.timezone")} list="screen-timezones" value={zone} onChange={(event) => { const next = event.target.value; setZone(next); const current = mine.find((item) => item.id === scheduleId); if (current) load(current, next); }} />
        <datalist id="screen-timezones">{ZONES.map((item) => <option key={item} value={item} />)}</datalist>
      </label>
      {mine.length ? (
        <label className="text-sm">{t("sa2.savedWindow")}
          <select className="field mt-1 w-full" aria-label={t("sa2.savedScheduleAria")} value={scheduleId} onChange={(event) => load(mine.find((item) => item.id === event.target.value) ?? null)}>
            <option value="">{t("sa2.newWindow")}</option>
            {mine.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      ) : null}
      <label className="text-sm">{t("sa2.playlist")}
        <select className="field mt-1 w-full" aria-label={t("sa2.playlistAria")} value={playlistId} onChange={(event) => setPlaylistId(event.target.value)}>
          <option value="">{t("sa2.choosePlaylist")}</option>
          {playlists.map((item) => <option key={item.id} value={item.id}>{item.name}{item.publishedAt ? "" : ` ${t("sa2.notPublished").trim()}`}</option>)}
        </select>
      </label>
      <p className="text-sm text-muted">{t("sa2.publishedNote")}</p>
      <label className="text-sm">{t("sa2.name")}
        <input className="field mt-1 w-full" aria-label={t("sa2.nameAria")} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        {DAYS.map((day) => {
          const on = weekdays.includes(day.value);
          return (
            <button key={day.value} type="button" className={`btn min-h-11 ${on ? "btn-primary" : ""}`} aria-pressed={on}
              onClick={() => setWeekdays(on ? weekdays.filter((value) => value !== day.value) : [...weekdays, day.value].sort((a, b) => a - b))}>
              {t(day.labelKey)}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">{t("sa2.from")}
          <input className="field mt-1 w-full" aria-label={t("sa2.startAria")} type="time" value={start === "24:00" ? "00:00" : start} onChange={(event) => { setStart(event.target.value); setOvernightOk(false); }} />
        </label>
        <label className="text-sm">{t("sa2.until")}
          <input className="field mt-1 w-full" aria-label={t("sa2.endAria")} type="time" value={end === "24:00" ? "00:00" : end} onChange={(event) => { setEnd(event.target.value); setOvernightOk(false); }} />
        </label>
      </div>
      {overnight ? (
        <div className="note-warn grid gap-2" role="status">
          <p>{overnightMessage(start, end, t)}</p>
          <label className="flex items-center gap-2 min-h-11"><input type="checkbox" checked={overnightOk} onChange={(event) => setOvernightOk(event.target.checked)} /> {t("dp.yesOvernight")}</label>
        </div>
      ) : null}
      {overlaps.length ? (
        <div className="note-warn text-sm grid gap-1" role="status">{overlaps.map((item) => <p key={item.other.id ?? item.other.name}>{item.message}</p>)}</div>
      ) : null}
      <button type="submit" className="btn btn-primary min-h-11">{scheduleId ? t("sa2.updateSchedule") : t("sa2.saveSchedule")}</button>
    </form>
  );
}
