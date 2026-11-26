"use client";
/**
 * Peek My Screens list (handoff 05-ROUTES "/dashboard/screens", boards 01-Main / 02-Screens-narrow).
 * Presentation only: it gets the same /api/displays data, links and ⋯ actions as the current list in
 * components/my-screens.tsx, which renders it only inside the Peek preview.
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { IconCalendar, IconList, IconSearch, IconTv } from "@/components/icons";
import { timeAgo, type DisplayItem, type ScreenGroupItem } from "@/lib/api";
import { contentLabel, heartbeatText, useOfflineTitle } from "@/components/tv";
import { LoadState } from "@/components/ui";
import { assignedContentPreview, assignedKindLabel } from "@/lib/assigned-content";
import { SCREEN_FILTER_MIN } from "@/lib/screen-filter";
import { filterPeekScreens, peekScreenCounts, peekScreenStatus, type PeekScreenFilter } from "@/lib/peek-screens";
import { PeekScreenPill } from "@/components/peek/screen-pill";
import { useT } from "@/lib/i18n/client";
import { EmptyState, Fab, OverflowMenu, Peek, PeekBanner, PeekLinkButton, SegmentedFilter, SkeletonRegion, Skeleton, StatusPill } from "@/components/peek/ui";

export function PeekMyScreens({ displays, groups, billing }: {
  displays: { data: DisplayItem[] | null | undefined; error: string | null };
  groups: ScreenGroupItem[];
  billing?: ReactNode;
}) {
  const t = useT();
  const list = displays.data ?? [];
  const counts = peekScreenCounts(list);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PeekScreenFilter>("all");
  const showFilters = list.length >= SCREEN_FILTER_MIN;
  const shown = showFilters ? filterPeekScreens(list, query, status) : list;
  const asleep = list.filter((display) => peekScreenStatus(display) === "asleep");
  useOfflineTitle(list);
  const addHref = "/dashboard/screens/add#add-screen";
  return (
    <section className="pk-screens min-w-0 overflow-x-clip" data-testid="peek-my-screens">
      <h1 className="pk-page-h1">{t("screens.title")}</h1>
      {billing ? <div className="mb-3">{billing}</div> : null}
      {list.length ? (
        <div className="pk-hero" data-testid="screens-hero">
          <Peek mood={counts.live === 0 && counts.asleep > 0 ? "asleep" : "open"} size={56} />
          <div className="min-w-0">
            <p className="pk-hero-title">{t("peek.screens.summary", { awake: counts.live, total: counts.all })}</p>
          </div>
          <div className="pk-hero-pills">
            <StatusPill variant="live">{t("peek.status.live")} ({counts.live})</StatusPill>
            <StatusPill variant="asleep">{t("peek.status.asleep")} ({counts.asleep})</StatusPill>
            <StatusPill variant="wait">{t("peek.status.waiting")} ({counts.waiting})</StatusPill>
          </div>
        </div>
      ) : null}
      <div className="pk-screens-toolbar">
        {showFilters ? (
          <>
            <label className="pk-search">
              <IconSearch />
              <input type="search" className="pk-input" placeholder={t("screens.search")} aria-label={t("screens.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <div data-testid="screen-filters" className="min-w-0 max-w-full">
              <SegmentedFilter fill label={t("screens.statusFilter")} value={status} onChange={setStatus} options={[
                { id: "all", label: t("peek.screens.filterAll", { count: counts.all }) },
                { id: "live", label: t("peek.screens.filterLive", { count: counts.live }) },
                { id: "asleep", label: t("peek.screens.filterAsleep", { count: counts.asleep }) },
                { id: "waiting", label: t("peek.screens.filterWaiting", { count: counts.waiting }) },
              ]} />
            </div>
          </>
        ) : null}
        <Link href="/dashboard/screens/groups" className="pk-link">{t("screens.groupsLink")}</Link>
        <span className="flex-1 max-md:hidden" />
        <PeekLinkButton href={addHref} variant="accent" className="max-md:!hidden"><PlusGlyph />{t("screens.add")}</PeekLinkButton>
      </div>
      {asleep.length ? (
        <div className="grid gap-2 mb-4" data-testid="asleep-banners">
          {asleep.map((display) => (
            <PeekBanner key={display.id} variant="asleep" peek="asleep"
              action={<PeekLinkButton href={`/dashboard/screens/${display.id}#reconnect`} variant="quiet" size="compact">{t("peek.screens.reconnect")}</PeekLinkButton>}>
              {t("peek.screens.fellAsleep", { name: display.name, ago: timeAgo(display.lastSeenAt, t) })}
            </PeekBanner>
          ))}
        </div>
      ) : null}
      {!displays.data ? (
        displays.error ? <LoadState error={displays.error} /> : (
          <SkeletonRegion label={t("screens.loading")}>
            <div className="pk-screen-grid">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-64" />)}</div>
          </SkeletonRegion>
        )
      ) : list.length === 0 ? (
        <EmptyState title={t("screens.emptyTitle")} body={t("screens.emptyBody")} action={<PeekLinkButton href={addHref} variant="accent">{t("screens.add")}</PeekLinkButton>} />
      ) : shown.length === 0 ? (
        <div role="status" data-testid="screen-filter-empty"><EmptyState title={t("screens.noMatch")} /></div>
      ) : (
        <ul className="pk-screen-grid" data-testid="screen-cards">
          {shown.map((display) => <ScreenCard key={display.id} display={display} />)}
        </ul>
      )}
      {groups.length ? (
        <div className="mt-8">
          <h2 className="pk-section-title">{t("screens.groups")}</h2>
          <ul className="grid gap-2">
            {groups.map((group) => (
              <li key={group.id}>
                <Link href={`/dashboard/screens/groups/${group.id}`} className="pk-card">
                  <span className="font-semibold">{group.name}</span>
                  <span className="text-sm text-muted"> · {t("screens.groupCount", { n: group.displayIds.length })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Fab href={addHref} label={t("screens.add")} />
    </section>
  );
}

function PlusGlyph() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function ScreenCard({ display }: { display: DisplayItem }) {
  const t = useT();
  const status = peekScreenStatus(display);
  const preview = assignedContentPreview(display, t);
  const [failed, setFailed] = useState<string | null>(null);
  const src = preview.src && preview.src !== failed ? preview.src : null;
  const href = `/dashboard/screens/${display.id}`;
  return (
    <li className="min-w-0 flex" data-testid="screen-card" data-status={status}>
      <article className="pk-card pk-screen-card">
        <Link href={href} className="pk-screen-thumb" tabIndex={-1} aria-hidden="true">
          <div className="pk-bezel-screen">
            {src ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} />
              : status === "waiting" ? <Peek mood="open" size={44} outline={false} />
              : <span className="pk-thumb-kind">{assignedKindLabel(preview.kind, t)}</span>}
          </div>
        </Link>
        <div className="pk-screen-body">
          <div className="pk-screen-head">
            <h2 className="pk-screen-name"><Link href={href}>{display.name}</Link></h2>
            <PeekScreenPill display={display} />
          </div>
          <p className="pk-screen-meta">{contentLabel(display, t)}{display.connected ? <> · {heartbeatText(display, t)}</> : null}</p>
          {display.location?.name ? <p className="pk-screen-meta">{display.location.name}</p> : null}
        </div>
        <div className="pk-screen-actions" data-testid="screen-card-actions">
          <PeekLinkButton href={`${href}?panel=change`} variant="tint" className="flex-1">{t("sa.change")}</PeekLinkButton>
          <OverflowMenu label={t("screens.moreFor", { name: display.name })} items={[
            { id: "schedule", href: `${href}?panel=schedule`, label: t("sa.schedule"), icon: <IconCalendar /> },
            { id: "playlist", href: `${href}?panel=playlist`, label: t("sa.playlist"), icon: <IconList /> },
            { id: "open", href, label: t("screens.openScreen"), icon: <IconTv /> },
          ]} />
        </div>
      </article>
    </li>
  );
}
