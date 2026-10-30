"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi, type PlaylistDetail, type PlaylistSummary } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { IconList } from "@/components/icons";
import { EmptyState, LoadState, PageHeader } from "@/components/ui";

export function Playlists({ fixture }: { fixture?: PlaylistSummary[] }) {
  const live = useApi<PlaylistSummary[]>(fixture ? null : "/api/playlists");
  const data = fixture ?? live.data;
  const error = fixture ? null : live.error;
  const reload = fixture ? async () => {} : live.reload;
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      const created = await api<{ id: string }>("/api/playlists", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      router.push(`/dashboard/playlists/${created.id}`);
    } catch (err) {
      toast.show((err as Error).message, true);
      setCreating(false);
    }
  }

  async function remove(playlist: PlaylistSummary) {
    const ok = await confirm.ask({
      title: "Delete this playlist?",
      body: `Delete “${playlist.name}”? TVs showing it will switch to “No content assigned”.`,
      confirmLabel: "Delete playlist",
      danger: true,
    });
    if (ok !== true) return;
    try {
      await api(`/api/playlists/${playlist.id}`, { method: "DELETE" });
      toast.show("Deleted");
      reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }

  async function duplicate(playlist: PlaylistSummary) {
    setWorkingId(playlist.id);
    try {
      const detail = await api<PlaylistDetail>(`/api/playlists/${playlist.id}`);
      const copyName = `Copy of ${detail.name}`.slice(0, 80);
      const created = await api<{ id: string }>("/api/playlists", {
        method: "POST",
        body: JSON.stringify({ name: copyName }),
      });
      try {
        await api(`/api/playlists/${created.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: copyName,
            defaultDurationMs: detail.defaultDurationMs,
            transition: detail.transition,
            items: detail.items.map((item) => ({ mediaId: item.mediaId, durationMs: item.durationMs })),
          }),
        });
      } catch (err) {
        await api(`/api/playlists/${created.id}`, { method: "DELETE" }).catch(() => undefined);
        throw err;
      }
      toast.show("Duplicated as a draft");
      await reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <section>
      <PageHeader title="Playlists" icon={<IconList />} lede="A playlist loops images and video on one or more screens. Saving a draft does not change a screen." />
      <form onSubmit={create} className="card p-4 md:p-5 mb-8">
        <h2 className="font-semibold">New playlist</h2>
        <p className="text-sm text-muted mb-4">Name it, add slides, then publish when you want the TVs to change.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input className="field" required maxLength={80} placeholder="Name, like Lunch specials" aria-label="Playlist name"
            value={name} onChange={(event) => setName(event.target.value)} />
          <button className="btn btn-primary" disabled={creating}>{creating ? "Creating…" : "Create playlist"}</button>
        </div>
      </form>

      {!data ? (
        <LoadState error={error} label="Loading…" />
      ) : data.length === 0 ? (
        <EmptyState title="No playlists yet">Create one, add images or video from your library, then publish it to a screen.</EmptyState>
      ) : (
        <>
        {data.length >= SEARCH_FROM ? (
          <input className="field mb-3" type="search" aria-label="Search playlists" placeholder="Search playlists" value={search} onChange={(e) => setSearch(e.target.value)} />
        ) : null}
        {byName(data, search).length === 0 ? <EmptyState title="No playlists match that search">Try another name, or clear the search.</EmptyState> : null}
        <ul className="grid gap-3">
          {byName(data, search).map((playlist) => {
            const screens = playlist.displayNames?.length
              ? playlist.displayNames.join(", ")
              : playlist.displayCount
                ? `${playlist.displayCount} ${playlist.displayCount === 1 ? "screen" : "screens"}`
                : "";
            return (
              <li key={playlist.id} className="card p-4 flex flex-col gap-3 lg:flex-row lg:items-center min-w-0">
                <Link href={`/dashboard/playlists/${playlist.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="block w-24 shrink-0 aspect-video bg-black rounded-md overflow-hidden">
                    {playlist.thumbnailUrl ? <img src={playlist.thumbnailUrl} alt="" className="size-full object-contain" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="font-semibold block truncate">{playlist.name}</span>
                    <span className="text-sm text-muted block truncate">
                      {playlist.slideCount} {playlist.slideCount === 1 ? "slide" : "slides"}
                      {screens ? ` · on ${screens}` : ""}
                    </span>
                  </span>
                </Link>
                <div className="flex flex-wrap gap-2">
                  <span className={statusClass(playlist)}>{statusLabel(playlist)}</span>
                  <Link href={`/dashboard/playlists/${playlist.id}`} className="btn btn-quiet">Edit</Link>
                  <button type="button" className="btn btn-quiet" disabled={workingId === playlist.id} onClick={() => duplicate(playlist)}>Duplicate</button>
                  <button type="button" className="btn btn-quiet text-danger" onClick={() => remove(playlist)}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
        </>
      )}
      {toast.node}
      {confirm.node}
    </section>
  );
}

export default function PlaylistsPage() {
  return <Playlists />;
}

function statusLabel(playlist: PlaylistSummary) {
  if (!playlist.publishedAt) return "Draft";
  if (new Date(playlist.updatedAt).getTime() > new Date(playlist.publishedAt).getTime() + 1000) return "Unpublished changes";
  return "Published";
}

function statusClass(playlist: PlaylistSummary) {
  const label = statusLabel(playlist);
  if (label === "Published") return "badge badge-live";
  if (label === "Unpublished changes") return "badge badge-warn";
  return "badge";
}

/** M14: lists with this many entries get a search box. */
export const SEARCH_FROM = 6;
export function byName<T extends { name: string }>(items: T[], search: string) {
  const q = search.trim().toLowerCase();
  return q ? items.filter((item) => item.name.toLowerCase().includes(q)) : items;
}
