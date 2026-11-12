"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi, type DisplayItem, type ScreenGroupItem } from "@/lib/api";
import { contentLabel, heartbeatLabel, OfflineAlert, Status } from "@/components/tv";
import { syncLine } from "@/lib/sync-line";
import { clockLabel, nowPlaying } from "@/lib/now-playing";
import { GroupPublish } from "@/components/group-publish";
import { EmptyState, LimitNote, LoadState, PageHeader, Stat, atLimit } from "@/components/ui";
import { AssignedThumb } from "@/components/assigned-thumb";
import { ScreenActions, type ScreenLibrary } from "@/components/screen-actions";
import { useConfirm } from "@/components/confirm";
import { useToast } from "@/components/toast";
import { unifiedEditorPath } from "@/lib/menu-board-unify";

export function MyScreens({ fixture }: { fixture?: { displays: DisplayItem[]; groups?: ScreenGroupItem[] } } = {}) {
  const liveDisplays = useApi<DisplayItem[]>(fixture ? null : "/api/displays", 10_000);
  const liveGroups = useApi<ScreenGroupItem[]>(fixture ? null : "/api/screen-groups");
  const displays = fixture ? { data: fixture.displays, error: null as string | null } : liveDisplays;
  const groups = fixture ? { data: fixture.groups ?? [], error: null as string | null } : liveGroups;
  const list = displays.data ?? [];
  const onlineCount = list.filter((display) => display.online).length;
  const offlineCount = list.filter((display) => display.connected && !display.online).length;
  return (
    <section className="min-w-0 overflow-x-hidden">
      <PageHeader compact title="My Screens" lede="Pick a screen or a group. Change what it plays from there."
        action={<Link href="/dashboard/displays#add-screen" className="btn btn-primary min-h-11">Add screen</Link>}
      />
      {list.length ? (
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
          <Stat label="Total screens" value={list.length} />
          <Stat label="Online" value={onlineCount} tone="live" />
          <Stat label="Offline" value={offlineCount} tone="danger" />
        </div>
      ) : null}
      <p className="text-sm mb-4"><Link href="/dashboard/screens/groups" className="font-semibold text-primary underline underline-offset-4">Screen groups</Link></p>
      {displays.data ? <OfflineAlert displays={displays.data} /> : null}
      {!displays.data ? <LoadState error={displays.error} label="Loading screens…" /> : displays.data.length === 0 ? (
        <EmptyState title="No screens yet">
          Pair a TV, then come back here to choose what it plays. <Link href="/dashboard/displays#add-screen" className="underline font-semibold">Add screen</Link>.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {displays.data.map((display) => (
            <li key={display.id} className="min-w-0">
              <article className="card p-4 min-w-0">
                <div className="flex items-start gap-3">
                  <Link href={`/dashboard/screens/${display.id}`} className="block min-h-11 min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-semibold truncate">{display.name}</h2>
                      <Status display={display} />
                    </div>
                    <p className="text-sm mt-2 truncate">{contentLabel(display)}</p>
                    <p className="text-xs text-muted mt-1">{display.location?.name ?? "No location"} · {heartbeatLabel(display.lastSeenAt)}</p>
                  </Link>
                  <AssignedThumb display={display} />
                </div>
                {display.connected && !display.online ? (
                  <p className="text-sm mt-2">This screen is offline. You can still change content; the TV updates when it comes back online.</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className="btn btn-primary min-h-11" href={`/dashboard/screens/${display.id}?panel=change`}>Change content</Link>
                  <Link className="btn btn-quiet min-h-11" href={`/dashboard/screens/${display.id}?panel=schedule`}>Schedule</Link>
                  <Link className="btn btn-quiet min-h-11" href={`/dashboard/screens/${display.id}?panel=playlist`}>Edit playlist</Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      {groups.data && groups.data.length ? (
        <div className="mt-8">
          <h2 className="font-semibold mb-3">Groups</h2>
          <ul className="grid gap-2">
            {groups.data.map((group) => (
              <li key={group.id}>
                <Link href={`/dashboard/screens/groups/${group.id}`} className="card block p-4 min-h-11">
                  <span className="font-semibold">{group.name}</span>
                  <span className="text-sm text-muted"> · {group.displayIds.length} screens</span>
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
  const displays = useApi<DisplayItem[]>(fixture ? null : "/api/displays", 10_000);
  const timeline = useApi<{ nextChange: DisplayItem["nextChange"] }>(fixture ? null : `/api/displays/${id}/timeline`, 10_000);
  const confirm = useConfirm();
  const toast = useToast();
  const display = fixture ?? displays.data?.find((item) => item.id === id);
  if (!fixture && !displays.data) return <LoadState error={displays.error} label="Loading this screen…" />;
  if (!display) return <EmptyState title="That screen is not in this account">It may have been disconnected. <Link href="/dashboard/screens" className="underline font-semibold">Back to My Screens</Link>.</EmptyState>;
  async function removeScreen() {
    const ok = await confirm.ask({
      title: "Remove this screen?",
      body: `Remove “${display!.name}”? The TV goes back to a pairing code. Playlists, media, and other screens stay.`,
      confirmLabel: "Remove screen",
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
  const preview = display.boardPreviewUrl || display.media?.url || display.playlist?.url;
  const next = display.nextChange ?? timeline.data?.nextChange ?? null;
  return (
    <section className="min-w-0 overflow-x-hidden">
      <PageHeader compact title={display.name} lede={display.location ? `${display.location.name} · ${display.location.timezone}` : "No location yet"}
        action={<Link href="/dashboard/screens" className="btn btn-primary min-h-11">All screens</Link>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/dashboard/displays#add-screen" className="btn btn-quiet min-h-11">Add screen</Link>
        {fixture ? null : <button type="button" className="btn btn-quiet text-danger min-h-11" onClick={() => { void removeScreen(); }}>Remove screen</button>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="card p-4 min-w-0">
          <h2 className="font-semibold">What's playing</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Status display={display} />
            <span className="text-sm">{nowPlaying(contentLabel(display), display.currentSchedule ? { name: display.currentSchedule.name, playlistName: display.currentSchedule.playlistName, untilLabel: clockLabel(display.currentSchedule.until) } : null)}</span>
          </div>
          <p className="text-sm text-muted mt-2"><time dateTime={display.lastSeenAt ?? undefined}>{heartbeatLabel(display.lastSeenAt)}</time></p>
          {next ? <p className="text-sm mt-3">Next change: {next.label}{next.at ? ` · ${new Date(next.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true })}` : ""}</p> : <p className="text-sm mt-3 text-muted">No scheduled change in the next few days.</p>}
          <p className="text-sm mt-3" data-testid="sync-state">
            {syncLine(display)}
          </p>
          {display.connected && !display.online ? (
            <p className="text-sm mt-3">This screen is offline. Check that the TV is on, joined to Wi-Fi, and still open on the Pekko player.</p>
          ) : null}
          {!contentLabel(display) || contentLabel(display) === "No content assigned" ? (
            <p className="text-sm mt-3">Nothing is assigned. <Link href="/dashboard/media" className="underline font-semibold">Add media</Link> or <Link href={unifiedEditorPath({ screen: display.id, isNew: true })} className="underline font-semibold">open Menu boards</Link>.</p>
          ) : null}
          <ScreenActions display={display} preview={Boolean(fixture)} library={library} initialPanel={initialPanel} onChanged={() => displays.reload()} />
        </article>
        {confirm.node}
        {toast.node}
        <article className="card p-4 min-w-0">
          <h2 className="font-semibold">Preview</h2>
          <p className="text-sm text-muted mt-1">This is a preview of the assigned file, not a live picture of the TV.</p>
          <div className="mt-3 aspect-video bg-ink rounded-xl overflow-hidden grid place-items-center">
            {preview ? <img src={preview} alt="" className="w-full h-full object-contain" /> : <span className="text-sm text-white/70 px-4 text-center">Nothing to preview yet</span>}
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
  const liveDisplays = useApi<DisplayItem[]>(fixture ? null : "/api/displays");
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
      toast.show("This preview doesn't save.", true);
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
      toast.show("Group added");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="min-w-0 overflow-x-hidden">
      <PageHeader compact title="Screen groups" lede="A group shares schedules. A screen's own schedule still wins while it is on."
        action={<button type="button" className="btn btn-primary min-h-11" onClick={() => { setCreating(true); setError(null); }}>New group</button>}
      />
      <p className="text-sm mb-4"><Link href="/dashboard/screens" className="font-semibold text-primary underline underline-offset-4">All screens</Link></p>
      {creating ? (
        <form className="card p-4 grid gap-3 mb-4" onSubmit={(event) => { void createGroup(event); }}>
          <h2 className="font-semibold">New group</h2>
          <p className="text-sm text-muted">Name the group and choose the screens that share its schedules. You can add screens later.</p>
          <label className="text-sm font-semibold">Group name
            <input className="field mt-1" aria-label="Group name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} placeholder="Demo Café front" />
          </label>
          {displays.data ? <GroupMembers displays={displays.data} picked={picked} onChange={setPicked} /> : <p className="text-sm text-muted">Loading screens…</p>}
          <LimitNote count={groups.data?.length} max={100} noun="screen groups" />
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary min-h-11" disabled={saving || atLimit(groups.data?.length, 100)}>{saving ? "Creating…" : "Create group"}</button>
            <button type="button" className="btn btn-quiet min-h-11" onClick={() => { setCreating(false); setError(null); }}>Cancel</button>
          </div>
        </form>
      ) : null}
      {!groups.data ? <LoadState error={groups.error} label="Loading groups…" /> : groups.data.length === 0 ? (
        <EmptyState title="No groups yet">
          <p>A group shares schedules across screens. A screen with no group just plays its own assignment.</p>
          <button type="button" className="btn btn-primary min-h-11 mt-4" onClick={() => { setCreating(true); setError(null); }}>New group</button>
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {groups.data.map((group) => {
            const members = (displays.data ?? []).filter((display) => group.displayIds.includes(display.id));
            const online = members.filter((display) => display.online).length;
            return (
              <li key={group.id}>
                <Link href={`/dashboard/screens/groups/${group.id}`} className="card block p-4 min-h-11">
                  <span className="font-semibold">{group.name}</span>
                  <span className="text-sm text-muted"> · {members.length} screens · {online} online</span>
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
  if (!displays.length) return <p className="text-sm text-muted">Connect a screen before adding it to a group. You can still create the group and add screens later.</p>;
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-semibold">Screens in this group</legend>
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

export function GroupWorkspace({ id }: { id: string }) {
  const groups = useApi<ScreenGroupItem[]>("/api/screen-groups");
  const displays = useApi<DisplayItem[]>("/api/displays", 10_000);
  const group = groups.data?.find((item) => item.id === id);
  if (!groups.data || !displays.data) return <LoadState error={groups.error || displays.error} label="Loading this group…" />;
  if (!group) return <EmptyState title="That group is not in this account"><Link href="/dashboard/screens/groups" className="underline font-semibold">Back to groups</Link>.</EmptyState>;
  const members = displays.data.filter((display) => group.displayIds.includes(display.id));
  const online = members.filter((display) => display.online).length;
  const offline = members.filter((display) => display.connected && !display.online).length;
  return (
    <section className="min-w-0 overflow-x-hidden">
      <PageHeader compact title={group.name} lede={`${online} online · ${offline} offline · ${members.length} screens`}
        action={<Link href="/dashboard/screens/groups" className="btn btn-primary min-h-11">All groups</Link>}
      />
      <GroupPublish groupId={group.id} members={members} onChanged={() => displays.reload()} />
      <article className="card p-4 mb-4 text-sm">
        <h2 className="font-semibold">What wins</h2>
        <ol className="mt-2 list-decimal pl-5 grid gap-1">
          <li>A schedule for one screen beats a schedule for this group, while that time window is on.</li>
          <li>If two schedules overlap, the higher priority wins, then the one updated last.</li>
          <li>With no schedule, each screen plays its own saved assignment. Publishing here does not wipe a screen you leave unchecked.</li>
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
              <p className="text-sm mt-1">{nowPlaying(contentLabel(display), display.currentSchedule ? { name: display.currentSchedule.name, playlistName: display.currentSchedule.playlistName, untilLabel: clockLabel(display.currentSchedule.until) } : null)}</p>
              {display.currentSchedule ? <p className="text-xs text-muted mt-1">Schedule on now: {display.currentSchedule.name}</p> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
