"use client";

import Link from "next/link";
import { IconImage } from "@/components/icons";
import { LoadState, PageHeader } from "@/components/ui";
import { useApi, type MediaItem, type PlaylistSummary } from "@/lib/api";
import {
  CONTENT_CATEGORIES,
  kindLabel,
  recentFor,
  type ContentCategory,
  type ContentHubFixture,
  type ContentRecentItem,
} from "@/lib/content-hub";
import { unifiedEditorPath } from "@/lib/menu-board-unify";

type MenuRow = { id: string; name: string };
type PromoRow = { id: string; name: string };

export function ContentHub({ pathOverride, fixture }: { pathOverride?: string; fixture?: ContentHubFixture }) {
  const liveMedia = useApi<MediaItem[]>(fixture ? null : "/api/media");
  const liveMenus = useApi<{ menus: MenuRow[]; available?: boolean }>(fixture ? null : "/api/menus");
  const livePromos = useApi<{ promos: PromoRow[]; available?: boolean }>(fixture ? null : "/api/promos");
  const livePlaylists = useApi<PlaylistSummary[]>(fixture ? null : "/api/playlists");
  const recent = fixture?.recent ?? liveRecent(liveMedia.data, liveMenus.data?.menus, livePromos.data?.promos, livePlaylists.data);
  const loading = !fixture && !liveMedia.data && !liveMenus.data && !livePromos.data && !livePlaylists.data
    && (liveMedia.error || liveMenus.error || livePromos.error || livePlaylists.error ? false : true);

  return (
    <section className="min-w-0" data-preview-path={pathOverride} data-testid="content-hub">
      <PageHeader
        title="Content"
        eyebrow="Library"
        lede="Create something new, or open what you already have."
        icon={<IconImage />}
      />
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Content categories">
        {CONTENT_CATEGORIES.map((category) => (
          <li key={category.id} className="card p-4 min-w-0 flex flex-col gap-3" data-testid={`content-card-${category.id}`}>
            <div>
              <h2 className="font-semibold">
                <Link href={category.href} className="text-ink underline-offset-4 hover:underline">
                  {category.title}
                </Link>
              </h2>
              <p className="text-sm text-muted mt-1">{category.lede}</p>
            </div>
            <div>
              <Link href={category.createHref} className="btn btn-primary min-h-11" data-testid={`content-create-${category.id}`}>
                {category.createLabel}
              </Link>
            </div>
            <RecentList category={category} items={recentFor(recent, category.id)} />
          </li>
        ))}
      </ul>
      {loading ? <LoadState label="Loading your content…" /> : null}
    </section>
  );
}

function RecentList({ category, items }: { category: ContentCategory; items: ContentRecentItem[] }) {
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{kindLabel(category.id)}</h3>
      {items.length ? (
        <ul className="mt-2 grid gap-1" aria-label={`Recent ${kindLabel(category.id)}`}>
          {items.map((item) => (
            <li key={item.id} className="min-w-0">
              <Link href={item.href} className="text-sm font-medium text-primary underline underline-offset-4 break-words">
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted mt-1">None yet. {category.createLabel} to start.</p>
      )}
    </div>
  );
}

function liveRecent(
  media: MediaItem[] | null | undefined,
  menus: MenuRow[] | null | undefined,
  promos: PromoRow[] | null | undefined,
  playlists: PlaylistSummary[] | null | undefined,
): ContentRecentItem[] {
  const items: ContentRecentItem[] = [];
  for (const menu of menus ?? []) {
    items.push({
      id: menu.id,
      name: menu.name,
      href: unifiedEditorPath({ board: menu.id }),
      kind: "menus",
      kindLabel: kindLabel("menus"),
    });
  }
  for (const promo of promos ?? []) {
    items.push({
      id: promo.id,
      name: promo.name,
      href: `/dashboard/media/promos?promo=${encodeURIComponent(promo.id)}`,
      kind: "promotions",
      kindLabel: kindLabel("promotions"),
    });
  }
  for (const playlist of playlists ?? []) {
    items.push({
      id: playlist.id,
      name: playlist.name,
      href: `/dashboard/playlists/${playlist.id}`,
      kind: "playlists",
      kindLabel: kindLabel("playlists"),
    });
  }
  for (const file of media ?? []) {
    if (file.kind === "presentation") {
      items.push({
        id: file.id,
        name: file.fileName,
        href: `/dashboard/media/presentations/${file.id}`,
        kind: "presentations",
        kindLabel: kindLabel("presentations"),
      });
    } else if (file.kind === "image" || file.kind === "video") {
      items.push({
        id: file.id,
        name: file.fileName,
        href: "/dashboard/media",
        kind: "media",
        kindLabel: kindLabel("media"),
      });
    }
  }
  return items;
}
