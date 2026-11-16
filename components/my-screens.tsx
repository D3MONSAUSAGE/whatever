"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi, type DisplayItem, type LocationItem, type ScreenGroupItem } from "@/lib/api";
import { screenNameWarning } from "@/lib/screen-names";
import { contentLabel, hasNoContent, heartbeatText, OfflineAlert, Status } from "@/components/tv";
import { useT } from "@/lib/i18n/client";
import { onlineNow, syncLine } from "@/lib/sync-line";
import { clockLabel, nowPlaying } from "@/lib/now-playing";
import { GroupPublish } from "@/components/group-publish";
import { EmptyState, LimitNote, LoadState, PageHeader, Stat, atLimit, useRequiredMessage } from "@/components/ui";
import { AssignedThumb } from "@/components/assigned-thumb";
import { ScreenActions, type ScreenLibrary } from "@/components/screen-actions";
import { ReconnectTv } from "@/components/reconnect-tv";
import { useConfirm } from "@/components/confirm";
import { useToast } from "@/components/toast";
import { unifiedEditorPath } from "@/lib/menu-board-unify";

export function MyScreens({ fixture }: { fixture?: { displays: DisplayItem[]; groups?: ScreenGroupItem[] } } = {}) {
  const t = useT();
  const liveDisplays = useApi<DisplayItem[]>(fixture ? null : "/api/displays", 10_000);
  const liveGroups = useApi<ScreenGroupItem[]>(fixture ? null : "/api/screen-groups");
  const displays = fixture ? { data: fixture.displays, error: null as string | null } : liveDisplays;
  const groups = fixture ? { data: fixture.groups ?? [], error: null as string | null } : liveGroups;
  const list = displays.data ?? [];
  const onlineCount = list.filter(onlineNow).length;
  const offlineCount = list.filter((display) => display.connected && !display.online).length;
  return (
    <section className="min-w-0 overflow-x-hidden">
      <PageHeader compact title={t("screens.title")} lede={t("screens.lede")}
        action={<Link href="/dashboard/screens/add#add-screen" className="btn btn-primary min-h-11">{t("screens.add")}</Link>}
      />
      {list.length ? (
        <div className="hidden sm:grid grid-cols-3 gap-2 mb-3">
          <Stat compact label={t("screens.total")} value={list.length} />
          <Stat compact label={t("tv.online")} value={onlineCount} tone="live" />
          <Stat compact label={t("tv.offline")} value={offlineCount} tone="danger" />
        </div>
      ) : null}
      {/* Phone: one summary line instead of three tiles and the offline banner, so the first
          screen's buttons are visible without scrolling (QA U2-06). Each card still shows its status. */}
      <p className="text-sm mb-3 sm:mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        {list.length ? (
          <span className="sm:hidden" data-testid="screens-summary">
            {t(list.length === 1 ? "screens.oneScreen" : "screens.manyScreens", { n: list.length })} · <span className="text-live-ink font-semibold">{t("screens.nOnline", { n: onlineCount })}</span>{offlineCount ? <> · <span className="text-danger font-semibold">{t("screens.nOffline", { n: offlineCount })}</span></> : null}
          </span>
        ) : null}
        <Link href="/dashboard/screens/groups" className="font-semibold text-primary underline underline-offset-4">{t("screens.groupsLink")}</Link>
      </p>
      {displays.data ? <div className="hidden sm:block"><OfflineAlert displays={displays.data} /></div> : null}
      {!displays.data ? <LoadState error={displays.error} label={t("screens.loading")} /> : displays.data.length === 0 ? (
        <EmptyState title={t("screens.emptyTitle")}>
          {t("screens.emptyBody")} <Link href="/dashboard/screens/add#add-screen" className="underline font-semibold">{t("screens.add")}</Link>.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {displays.data.map((display) => (
            <li key={display.id} className="min-w-0">
              <article className="card p-4 min-w-0">
                <div className="flex items-start gap-3">
                  <Link href={`/dashboard/screens/${display.id}`} className="block min-h-11 min-w-0 flex-1">
                    {/* Parity Phase 1 (W3): on a phone the status sits under the name so long names aren't cut short. */}
                    <div className="flex flex-col items-start gap-1 sm:flex-row sm:justify-between sm:gap-3" data-testid="screen-card-head">
                      <h2 className="font-semibold truncate max-w-full">{display.name}</h2>
                      <Status display={display} />
                    </div>
                    <p className="text-sm mt-2 truncate">{contentLabel(display, t)}</p>
                    <p className="text-xs text-muted mt-1">{display.location?.name ?? t("screens.noLocation")} · {heartbeatText(display, t)}</p>
                  </Link>
                  <AssignedThumb display={display} />
                </div>
                {display.connected && !display.online ? (
                  <p className="text-sm mt-2">{t("screens.offlineCard")}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className="btn btn-primary min-h-11" href={`/dashboard/screens/${display.id}?panel=change`}>{t("sa.change")}</Link>
                  <Link className="btn btn-quiet min-h-11" href={`/dashboard/screens/${display.id}?panel=schedule`}>{t("sa.schedule")}</Link>
                  <Link className="btn btn-quiet min-h-11" href={`/dashboard/screens/${display.id}?panel=playlist`}>{t("sa.playlist")}</Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      {groups.data && groups.data.length ? (
        <div className="mt-8">
          <h2 className="font-semibold mb-3">{t("screens.groups")}</h2>
          <ul className="grid gap-2">
            {groups.data.map((group) => (
              <li key={group.id}>
                <Link href={`/dashboard/screens/groups/${group.id}`} className="card block p-4 min-h-11">
                  <span className="font-semibold">{group.name}</span>
                  <span className="text-sm text-muted"> · {t("screens.groupCount", { n: group.displayIds.length })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function ScreenWorkspace({ id, fixture, library, initialPanel = null }: {
  id: string;
  fixture?: DisplayItem;
  library?: ScreenLibrary;
  initialPanel?: "upload" | "change" | "create" | "playlist" | "schedule" | null;
}) {
  const t = useT();
  const displays = useApi<DisplayItem[]>(fixture ? null : "/api/displays", 10_000);
  const timeline = useApi<{ nextChange: DisplayItem["nextChange"] }>(fixture ? null : `/api/displays/${id}/timeline`, 10_000);
  // Parity Phase 1 (W1): rename and location live here too, so My Screens covers what the legacy
  // /dashboard/displays list did. Same PATCH /api/displays/:id calls and disp.* strings as that page.
  const locations = useApi<LocationItem[]>(fixture ? null : "/api/locations");
  const confirm = useConfirm();
  const toast = useToast();
  const display = fixture ?? displays.data?.find((item) => item.id === id);
  if (!fixture && !displays.data) return <LoadState error={displays.error} label={t("screens.loadingOne")} />;
  if (!display) return <EmptyState title={t("screens.notInAccount")}>{t("screens.maybeDisconnected")} <Link href="/dashboard/screens" className="underline font-semibold">{t("screens.backToList")}</Link>.</EmptyState>;
  async function removeScreen() {
    const ok = await confirm.ask({
      title: t("screens.removeTitle"),
      body: t("screens.removeBody", { name: display!.name }),
      confirmLabel: t("screens.remove"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (ok !== true) return;
    try {
      await api(`/api/displays/${display!.id}`, { method: "DELETE" });
      location.assign("/dashboard/screens");
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }
  async function rename() {
    const name = await confirm.ask({
      title: t("disp.renameTitle"),
      body: t("disp.renameBody"),
      confirmLabel: t("disp.saveName"),
      cancelLabel: t("common.cancel"),
      input: { label: t("disp.name"), ariaLabel: t("disp.newName"), defaultValue: display!.name, maxLength: 60 },
    });
    if (typeof name !== "string" || name === display!.name) return;
    const others = (displays.data ?? []).filter((item) => item.id !== display!.id).map((item) => item.name);
    const dup = screenNameWarning(name, others, t);
    if (dup) toast.show(t("disp.suggested", { warning: dup.nameWarning, name: dup.suggestedName }));
    try {
      await api(`/api/displays/${display!.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      toast.show(t("disp.renamed"));
      void displays.reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }
  async function setLocation(locationId: string | null) {
    try {
      await api(`/api/displays/${display!.id}`, { method: "PATCH", body: JSON.stringify({ locationId }) });
      toast.show(t("disp.locationSaved"));
      void displays.reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }
  const preview = display.boardPreviewUrl || display.media?.url || display.playlist?.url;
  const next = display.nextChange ?? timeline.data?.nextChange ?? null;
  return (
    <section className="min-w-0 overflow-x-hidden">
      <PageHeader compact title={display.name} lede={display.location ? `${display.location.name} · ${display.location.timezone}` : t("screens.noLocationYet")}
        action={<Link href="/dashboard/screens" className="btn btn-primary min-h-11">{t("screens.all")}</Link>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/dashboard/screens/add#add-screen" className="btn btn-quiet min-h-11">{t("screens.add")}</Link>
        {fixture ? null : <button type="button" className="btn btn-quiet min-h-11" data-testid="rename-screen" onClick={() => { void rename(); }}>{t("disp.rename")}</button>}
        {fixture ? null : <button type="button" className="btn btn-quiet text-danger min-h-11" onClick={() => { void removeScreen(); }}>{t("screens.remove")}</button>}
        {locations.data && locations.data.length > 0 ? (
          <label className="flex items-center gap-2 text-sm font-semibold text-muted">
            {t("disp.location")}
            <select aria-label={t("disp.locationFor", { name: display.name })} className="field min-h-11 w-auto" data-testid="screen-location"
              value={display.location?.id ?? ""} onChange={(event) => { void setLocation(event.target.value || null); }}>
              <option value="">{t("disp.noLocation")}</option>
              {locations.data.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="card p-4 min-w-0">
          <h2 className="font-semibold">{t("screens.whatsPlaying")}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Status display={display} />
            <span className="text-sm" data-testid="now-playing">{!display.connected && (display.media || display.playlist) ? t("screen.setToShow", { name: contentLabel(display, t) }) : nowPlaying(contentLabel(display, t), display.currentSchedule ? { name: display.currentSchedule.name, playlistName: display.currentSchedule.playlistName, untilLabel: clockLabel(display.currentSchedule.until) } : null, t, hasNoContent(display))}</span>
          </div>
          <p className="text-sm text-muted mt-2" data-testid="heartbeat"><time dateTime={display.connected ? display.lastSeenAt ?? undefined : undefined}>{heartbeatText(display, t)}</time></p>
          {next ? <p className="text-sm mt-3">{t("screens.nextChange", { label: next.label })}{next.at ? ` · ${new Date(next.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true })}` : ""}</p> : <p className="text-sm mt-3 text-muted">{t("screens.noNextChange")}</p>}
          <p className="text-sm mt-3" data-testid="sync-state">
            {display.connected ? syncLine(display, t) : t("screen.noTvPlaying")}
          </p>
          {display.connected && !display.online ? (
            <p className="text-sm mt-3">{t("screens.offlineHelp")}</p>
          ) : null}
          {hasNoContent(display) && display.connected ? (
            <p className="text-sm mt-3">{t("screens.nothingAssigned")} <Link href="/dashboard/media" className="underline font-semibold">{t("screens.addMedia")}</Link> {t("screens.or")} <Link href={unifiedEditorPath({ screen: display.id, isNew: true })} className="underline font-semibold">{t("screens.openMenus")}</Link>.</p>
          ) : null}
          <ScreenActions display={display} preview={Boolean(fixture)} library={library} initialPanel={initialPanel} onChanged={() => displays.reload()} />
          <ReconnectTv display={display} preview={Boolean(fixture)} onConnected={() => { void displays.reload?.(); }} onMessage={(text, error) => toast.show(text, error)} />
        </article>
        {confirm.node}
        {toast.node}
        <article className="card p-4 min-w-0">
          <h2 className="font-semibold">{t("screens.preview")}</h2>
          <p className="text-sm text-muted mt-1">{t("screens.previewNote")}</p>
          <div className="mt-3 aspect-video bg-ink rounded-xl overflow-hidden grid place-items-center">
            {preview ? <img src={preview} alt="" className="w-full h-full object-contain" /> : <span className="text-sm text-white/70 px-4 text-center">{t("screens.nothingToPreview")}</span>}
          </div>
        </article>
      </div>
    </section>
  );
}

export function ScreenGroups({ fixture, startCreating = false }: {
  fixture?: { groups: ScreenGroupItem[]; displays: DisplayItem[] };
  startCreating?: boolean;
}) {
  const liveGroups = useApi<ScreenGroupItem[]>(fixture ? null : "/api/screen-groups");
  const liveDisplays = useApi<DisplayItem[]>(fixture ? null : "/api/displays", fixture ? undefined : 10_000);
  const t = useT();
  const requiredMsg = useRequiredMessage();
  const groups = fixture ? { data: fixture.groups, error: null as string | null, reload: async () => {} } : liveGroups;
  const displays = fixture ? { data: fixture.displays, error: null as string | null, reload: async () => {} } : liveDisplays;
  const toast = useToast();
  const [creating, setCreating] = useState(startCreating);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createGroup(event: React.FormEvent) {
    event.preventDefault();
    if (fixture) {
      toast.show(t("screens.previewNoSave"), true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api("/api/screen-groups", { method: "POST", body: JSON.stringify({ name, displayIds: picked }) });
      setName("");
      setPicked([]);
      setCreating(false);
      await groups.reload();
      toast.show(t("groups.added"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="min-w-0 overflow-x-hidden">
      <PageHeader compact title={t("groups.title")} lede={t("groups.lede")}
        action={<button type="button" className="btn btn-primary min-h-11" onClick={() => { setCreating(true); setError(null); }}>{t("groups.new")}</button>}
      />
      <p className="text-sm mb-4"><Link href="/dashboard/screens" className="font-semibold text-primary underline underline-offset-4">{t("screens.all")}</Link></p>
      {creating ? (
        <form className="card p-4 grid gap-3 mb-4" onSubmit={(event) => { void createGroup(event); }}>
          <h2 className="font-semibold">{t("groups.new")}</h2>
          <p className="text-sm text-muted">{t("groups.newHelp")}</p>
          <label className="text-sm font-semibold">{t("groups.name")}
            <input className="field mt-1" aria-label={t("groups.name")} value={name} onChange={(event) => setName(event.target.value)} required {...requiredMsg} maxLength={80} placeholder={t("groups.namePlaceholder")} />
          </label>
          {displays.data ? <GroupMembers displays={displays.data} picked={picked} onChange={setPicked} /> : <p className="text-sm text-muted">{t("screens.loading")}</p>}
          <LimitNote count={groups.data?.length} max={100} noun="screen groups" nounKey="groups.limitNoun" />
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary min-h-11" disabled={saving || atLimit(groups.data?.length, 100)}>{saving ? t("groups.creating") : t("groups.create")}</button>
            <button type="button" className="btn btn-quiet min-h-11" onClick={() => { setCreating(false); setError(null); }}>{t("common.cancel")}</button>
          </div>
        </form>
      ) : null}
      {!groups.data ? <LoadState error={groups.error} label={t("groups.loading")} /> : groups.data.length === 0 ? (
        <EmptyState title={t("groups.emptyTitle")}>
          <p>{t("groups.emptyBody")}</p>
          <button type="button" className="btn btn-primary min-h-11 mt-4" onClick={() => { setCreating(true); setError(null); }}>{t("groups.new")}</button>
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {groups.data.map((group) => {
            const members = (displays.data ?? []).filter((display) => group.displayIds.includes(display.id));
            const online = members.filter(onlineNow).length;
            return (
              <li key={group.id}>
                <Link href={`/dashboard/screens/groups/${group.id}`} className="card block p-4 min-h-11">
                  <span className="font-semibold">{group.name}</span>
                  <span className="text-sm text-muted">{t("groups.summary", { n: members.length, online })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function GroupMembers({ displays, picked, onChange }: { displays: DisplayItem[]; picked: string[]; onChange: (ids: string[]) => void }) {
  const t = useT();
  if (!displays.length) return <p className="text-sm text-muted">{t("groups.connectFirst")}</p>;
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-semibold">{t("groups.members")}</legend>
      {displays.map((display) => (
        <label key={display.id} className="flex items-center gap-2 min-h-11 text-sm">
          <input
            type="checkbox"
            checked={picked.includes(display.id)}
            aria-label={t("groups.include", { name: display.name })}
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

export function GroupWorkspace({ id }: { id: string }) {
  const t = useT();
  const groups = useApi<ScreenGroupItem[]>("/api/screen-groups");
  const displays = useApi<DisplayItem[]>("/api/displays", 10_000);
  const group = groups.data?.find((item) => item.id === id);
  if (!groups.data || !displays.data) return <LoadState error={groups.error || displays.error} label={t("groups.loadingOne")} />;
  if (!group) return <EmptyState title={t("groups.notInAccount")}><Link href="/dashboard/screens/groups" className="underline font-semibold">{t("groups.back")}</Link>.</EmptyState>;
  const members = displays.data.filter((display) => group.displayIds.includes(display.id));
  const online = members.filter(onlineNow).length;
  const offline = members.filter((display) => display.connected && !display.online).length;
  return (
    <section className="min-w-0 overflow-x-hidden">
      <PageHeader compact title={group.name} lede={t("groups.lede2", { online, offline, n: members.length })}
        action={<Link href="/dashboard/screens/groups" className="btn btn-primary min-h-11">{t("groups.all")}</Link>}
      />
      <GroupPublish groupId={group.id} members={members} onChanged={() => displays.reload()} />
      <article className="card p-4 mb-4 text-sm">
        <h2 className="font-semibold">{t("groups.whatWins")}</h2>
        <ol className="mt-2 list-decimal pl-5 grid gap-1">
          <li>{t("groups.rule1")}</li>
          <li>{t("groups.rule2")}</li>
          <li>{t("groups.rule3")}</li>
        </ol>
      </article>
      <ul className="grid gap-3">
        {members.map((display) => (
          <li key={display.id}>
            <Link href={`/dashboard/screens/${display.id}`} className="card block p-4 min-h-11">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold truncate">{display.name}</span>
                <Status display={display} />
              </div>
              <p className="text-sm mt-1">{nowPlaying(contentLabel(display, t), display.currentSchedule ? { name: display.currentSchedule.name, playlistName: display.currentSchedule.playlistName, untilLabel: clockLabel(display.currentSchedule.until) } : null, t, hasNoContent(display))}</p>
              {display.currentSchedule ? <p className="text-xs text-muted mt-1">{t("groups.scheduleOn", { name: display.currentSchedule.name })}</p> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
