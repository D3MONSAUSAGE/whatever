"use client";

import Link from "next/link";
import { api, useApi, type DisplayItem, type ScreenGroupItem } from "@/lib/api";
import { contentLabel, heartbeatLabel, OfflineAlert, Status } from "@/components/tv";
import { syncLine } from "@/lib/sync-line";
import { clockLabel, nowPlaying } from "@/lib/now-playing";
import { GroupPublish } from "@/components/group-publish";
import { EmptyState, LoadState, PageHeader } from "@/components/ui";
import { IconTv } from "@/components/icons";
import { ScreenActions } from "@/components/screen-actions";
import { useConfirm } from "@/components/confirm";
import { useToast } from "@/components/toast";

export function MyScreens() {
  const displays = useApi<DisplayItem[]>("/api/displays", 10_000);
  const groups = useApi<ScreenGroupItem[]>("/api/screen-groups");
  return (
    <section className="min-w-0 overflow-x-hidden">
      <PageHeader title="My Screens" eyebrow="Workspace" lede="Pick a screen or a group. Change what it plays from there." icon={<IconTv />}>
        <Link href="/dashboard/displays#add-screen" className="btn btn-primary min-h-11">Add screen</Link>
        <Link href="/dashboard/screens/groups" className="btn min-h-11">Screen groups</Link>
      </PageHeader>
      {displays.data ? <OfflineAlert displays={displays.data} /> : null}
      {!displays.data ? <LoadState error={displays.error} label="Loading screens…" /> : displays.data.length === 0 ? (
        <EmptyState title="No screens yet">
          Pair a TV, then come back here to choose what it plays. <Link href="/dashboard/displays#add-screen" className="underline font-semibold">Add screen</Link>.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {displays.data.map((display) => (
            <li key={display.id} className="min-w-0">
              <Link href={`/dashboard/screens/${display.id}`} className="card block p-4 min-h-11">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold truncate">{display.name}</h2>
                  <Status display={display} />
                </div>
                <p className="text-sm mt-2 truncate">{contentLabel(display)}</p>
                <p className="text-xs text-muted mt-1">{display.location?.name ?? "No location"} · {heartbeatLabel(display.lastSeenAt)}</p>
              </Link>
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

export function ScreenWorkspace({ id, fixture }: { id: string; fixture?: DisplayItem }) {
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
      <PageHeader title={display.name} eyebrow="Screen" lede={display.location ? `${display.location.name} · ${display.location.timezone}` : "No location yet"} icon={<IconTv />}>
        <Link href="/dashboard/screens" className="btn min-h-11">All screens</Link>
        <Link href="/dashboard/displays#add-screen" className="btn min-h-11">Add screen</Link>
        {fixture ? null : <button type="button" className="btn btn-quiet text-danger min-h-11" onClick={() => { void removeScreen(); }}>Remove screen</button>}
      </PageHeader>
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
            <p className="text-sm mt-3">Nothing is assigned. <Link href="/dashboard/media" className="underline font-semibold">Add media</Link> or <Link href={`/dashboard/media/layout-studio?screen=${display.id}`} className="underline font-semibold">open Layout Studio</Link>.</p>
          ) : null}
          <ScreenActions display={display} preview={Boolean(fixture)} onChanged={() => displays.reload()} />
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

export function ScreenGroups() {
  const groups = useApi<ScreenGroupItem[]>("/api/screen-groups");
  const displays = useApi<DisplayItem[]>("/api/displays");
  return (
    <section className="min-w-0 overflow-x-hidden">
      <PageHeader title="Screen groups" eyebrow="My Screens" lede="A group shares schedules. A screen's own schedule still wins while it is on." icon={<IconTv />}>
        <Link href="/dashboard/screens" className="btn min-h-11">All screens</Link>
      </PageHeader>
      {!groups.data ? <LoadState error={groups.error} label="Loading groups…" /> : groups.data.length === 0 ? (
        <EmptyState title="No groups yet">Groups are created from the schedule tools. A screen with no group just plays its own assignment.</EmptyState>
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
      <PageHeader title={group.name} eyebrow="Screen group" lede={`${online} online · ${offline} offline · ${members.length} screens`} icon={<IconTv />}>
        <Link href="/dashboard/screens/groups" className="btn min-h-11">All groups</Link>
      </PageHeader>
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
