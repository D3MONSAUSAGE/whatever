"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi, type PlaylistSummary } from "@/lib/api";
import { useToast } from "@/components/toast";

export default function Playlists() {
  const { data, error, reload } = useApi<PlaylistSummary[]>("/api/playlists");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api<{ id: string }>("/api/playlists", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      router.push(`/dashboard/playlists/${created.id}`);
    } catch (err) {
      toast.show((err as Error).message, true);
      setBusy(false);
    }
  }

  async function remove(playlist: PlaylistSummary) {
    if (!confirm(`Delete “${playlist.name}”? TVs showing it will switch to “No content assigned”.`)) return;
    try {
      await api(`/api/playlists/${playlist.id}`, { method: "DELETE" });
      toast.show("Deleted");
      reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Playlists</h1>
      <form onSubmit={create} className="rounded-lg bg-white border border-line p-4 md:p-5 mb-8">
        <h2 className="font-semibold">New playlist</h2>
        <p className="text-sm text-muted mb-4">A playlist loops images on one or more TVs. Saving a draft does not change a screen.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input className="field" required maxLength={80} placeholder="Name, like Lunch specials" aria-label="Playlist name"
            value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create playlist"}</button>
        </div>
      </form>

      {!data ? (
        <p className="text-muted">{error || "Loading…"}</p>
      ) : data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-8 text-center">
          <p className="font-medium">No playlists yet</p>
          <p className="text-muted text-sm mt-1">Create one, add images from your library, then publish it to a TV.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {data.map((playlist) => (
            <li key={playlist.id} className="rounded-lg bg-white border border-line p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link href={`/dashboard/playlists/${playlist.id}`} className="font-semibold hover:underline">{playlist.name}</Link>
                <p className="text-sm text-muted truncate">
                  {playlist.slideCount} {playlist.slideCount === 1 ? "slide" : "slides"}
                  {playlist.displayCount ? ` · on ${playlist.displayCount} ${playlist.displayCount === 1 ? "TV" : "TVs"}` : ""}
                  {" · "}{statusLabel(playlist)}
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/dashboard/playlists/${playlist.id}`} className="btn btn-quiet">Edit</Link>
                <button type="button" className="btn btn-quiet text-danger" onClick={() => remove(playlist)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {toast.node}
    </section>
  );
}

function statusLabel(playlist: PlaylistSummary) {
  if (!playlist.publishedAt) return "Draft";
  if (new Date(playlist.updatedAt).getTime() > new Date(playlist.publishedAt).getTime() + 1000) return "Unpublished changes";
  return "Published";
}
