"use client";
import { useT } from "@/lib/i18n/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi, type PlaylistDetail, type PlaylistSummary } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { IconList } from "@/components/icons";
import { EmptyState, LoadState, PageHeader, useRequiredMessage } from "@/components/ui";
import { makeT, type T } from "@/lib/i18n";
import { usePeekWeb } from "@/lib/peek-flag";
import { OverflowMenu } from "@/components/peek/ui";

export function Playlists({ fixture, pathOverride }: { fixture?: PlaylistSummary[]; pathOverride?: string }) {
  const peek = usePeekWeb();
  const t = useT();
  const requiredMsg = useRequiredMessage();
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
      title: t("pl.delTitle"),
      body: t("pl.delBody", { name: playlist.name }),
      confirmLabel: t("pl.delConfirm"),
      danger: true,
    });
    if (ok !== true) return;
    try {
      await api(`/api/playlists/${playlist.id}`, { method: "DELETE" });
      toast.show(t("pl.deleted"));
      reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }

  async function duplicate(playlist: PlaylistSummary) {
    setWorkingId(playlist.id);
    try {
      const detail = await api<PlaylistDetail>(`/api/playlists/${playlist.id}`);
      const copyName = t("pl.copyOf", { name: detail.name }).slice(0, 80);
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
      toast.show(t("pl.duplicated"));
      await reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <section data-preview-path={pathOverride}>
      <PageHeader title={t("pl.title")} icon={<IconList />} lede={t("pl.lede")} />
      <form id="new-playlist" onSubmit={create} className="card p-4 md:p-5 mb-8">
        <h2 className="font-semibold">{t("pl.new")}</h2>
        <p className="text-sm text-muted mb-4">{t("pl.newLede")}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <input className="field" required {...requiredMsg} maxLength={80} placeholder={t("pl.namePh")} aria-label={t("pl.nameAria")}
            value={name} onChange={(event) => setName(event.target.value)} />
          <button className="btn btn-primary" disabled={creating}>{creating ? t("pl.creating") : t("pl.create")}</button>
        </div>
      </form>

      {!data ? (
        <LoadState error={error} />
      ) : data.length === 0 ? (
        <EmptyState title={t("pl.emptyTitle")}>{t("pl.emptyBody")}</EmptyState>
      ) : (
        <>
        {data.length >= SEARCH_FROM ? (
          <input className="field mb-3" type="search" aria-label={t("pl.searchAria")} placeholder={t("pl.searchAria")} value={search} onChange={(e) => setSearch(e.target.value)} />
        ) : null}
        {byName(data, search).length === 0 ? <EmptyState title={t("pl.noMatchTitle")}>{t("pl.noMatchBody")}</EmptyState> : null}
        <ul className="grid gap-3">
          {byName(data, search).map((playlist) => {
            const screens = playlist.displayNames?.length
              ? playlist.displayNames.join(", ")
              : playlist.displayCount
                ? t(playlist.displayCount === 1 ? "pl.screenOne" : "pl.screenMany", { n: playlist.displayCount })
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
                      {t(playlist.slideCount === 1 ? "pl.slideOne" : "pl.slideMany", { n: playlist.slideCount })}
                      {screens ? ` · ${t("pl.on", { screens })}` : ""}
                    </span>
                  </span>
                </Link>
                <div className="flex flex-wrap gap-2 items-center pl-row-actions">
                  <span className={statusClass(playlist)}>{statusLabel(playlist, t)}</span>
                  {peek ? (
                    <>
                      <Link href={`/dashboard/playlists/${playlist.id}`} className="btn btn-quiet pl-edit">{t("ed.edit")}</Link>
                      {/* 19-R-Playlists (approved): Duplicate and Delete move into ⋯; same handlers and confirmation. */}
                      <OverflowMenu label={t("screens.moreFor", { name: playlist.name })} items={[
                        ...(workingId === playlist.id ? [] : [{ id: "duplicate", label: t("pl.duplicate"), onSelect: () => void duplicate(playlist) }]),
                        { id: "delete", label: t("ed.delete"), danger: true, onSelect: () => void remove(playlist) },
                      ]} />
                    </>
                  ) : (
                    <>
                  <Link href={`/dashboard/playlists/${playlist.id}`} className="btn btn-quiet">{t("ed.edit")}</Link>
                  <button type="button" className="btn btn-quiet" disabled={workingId === playlist.id} onClick={() => duplicate(playlist)}>{t("pl.duplicate")}</button>
                  <button type="button" className="btn btn-quiet text-danger" onClick={() => remove(playlist)}>{t("ed.delete")}</button>
                    </>
                  )}
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

function statusLabel(playlist: PlaylistSummary, t: T) {
  if (!playlist.publishedAt) return t("pl.draft");
  if (new Date(playlist.updatedAt).getTime() > new Date(playlist.publishedAt).getTime() + 1000) return t("pl.unpublished");
  return t("pl.published");
}

function statusClass(playlist: PlaylistSummary) {
  const label = statusLabel(playlist, makeT("en"));
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
