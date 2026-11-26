"use client";
/**
 * Peek Menu Boards list (handoff 05-ROUTES "/dashboard/media/menus", boards 03 / 04). Presentation only: the
 * same /api/menus + /api/displays data, the same Edit and Delete handlers (Delete keeps its confirmation).
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { timeAgo, type DisplayItem } from "@/lib/api";
import type { MenuBoard } from "@/components/menu-boards";
import { boardKindLabel } from "@/lib/menu-board-label";
import { storedOrientation } from "@/lib/board-orientation";
import { boardTvCount } from "@/lib/peek-publish";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n";
import { Fab, OverflowMenu, PeekButton, SegmentedFilter, StatusPill } from "@/components/peek/ui";

export type PeekBoardFilter = "all" | "live" | "drafts";

/** Live = on ≥ 1 connected TV through its own playlist. Draft = never published (no playlist or image yet). */
export function peekBoardState(menu: Pick<MenuBoard, "playlistId" | "mediaId">, displays: DisplayItem[] | null | undefined) {
  const tvs = boardTvCount(menu, displays);
  return { tvs, live: tvs > 0, draft: !menu.playlistId && !menu.mediaId };
}

export function filterPeekBoards<M extends Pick<MenuBoard, "playlistId" | "mediaId">>(menus: M[], displays: DisplayItem[] | null | undefined, filter: PeekBoardFilter): M[] {
  if (filter === "all") return menus;
  return menus.filter((m) => (filter === "live" ? peekBoardState(m, displays).live : peekBoardState(m, displays).draft));
}

/** Singular only for exactly one (boards can't outnumber TVs: one playlist per TV). */
export function showingSummaryText(t: T, boards: number, tvs: number): string {
  if (boards === 1 && tvs === 1) return t("peek.menus.showingSummaryOne");
  if (boards === 1) return t("peek.menus.showingSummaryOneBoard", { tvs });
  return t("peek.menus.showingSummary", { boards, tvs });
}

export function PeekMenuBoardsList({ menus, displays, onNew, newDisabled, onEdit, onDelete, brand, limitNote }: {
  menus: MenuBoard[];
  displays: DisplayItem[] | null | undefined;
  onNew: () => void;
  newDisabled: boolean;
  onEdit: (menu: MenuBoard) => void;
  onDelete: (menu: MenuBoard) => void;
  brand?: ReactNode;
  limitNote?: ReactNode;
}) {
  const t = useT();
  const [filter, setFilter] = useState<PeekBoardFilter>("all");
  const live = filterPeekBoards(menus, displays, "live");
  const drafts = filterPeekBoards(menus, displays, "drafts");
  const tvIds = new Set((displays ?? []).filter((d) => d.connected && d.playlist && menus.some((m) => m.playlistId && m.playlistId === d.playlist?.id)).map((d) => d.id));
  const shown = filterPeekBoards(menus, displays, filter);
  return (
    <div className="pk-boards" data-testid="peek-menu-boards">
      <h1 className="pk-page-h1">{t("mb.title")}</h1>
      <div className="pk-boards-head">
        <p className="pk-boards-lede">{t("mb.lede")}</p>
        <Link href="/dashboard/schedule#day-parts" className="pk-link">{t("mb.dayParts")}</Link>
        <PeekButton variant="accent" onClick={onNew} disabled={newDisabled} className="max-md:!hidden">{t("mb.new")}</PeekButton>
      </div>
      {brand}
      {limitNote}
      {menus.length ? (
        <div className="pk-boards-filters">
          <SegmentedFilter label={t("mb.title")} value={filter} onChange={setFilter} options={[
            { id: "all", label: t("peek.menus.filterAll", { count: menus.length }) },
            { id: "live", label: t("peek.menus.filterLive", { count: live.length }) },
            { id: "drafts", label: t("peek.menus.filterDrafts", { count: drafts.length }) },
          ]} />
          <span className="pk-boards-summary">{showingSummaryText(t, live.length, tvIds.size)}</span>
        </div>
      ) : null}
      <ul className="pk-board-grid" aria-label={t("mb.title")} data-testid="unify-list">
        {shown.map((menu) => {
          const state = peekBoardState(menu, displays);
          const portrait = storedOrientation(menu.content) === "portrait";
          return (
            <li key={menu.id} className="min-w-0 flex">
              <article className="pk-card pk-board-card">
                <button type="button" className="pk-board-thumb" onClick={() => onEdit(menu)} tabIndex={-1} aria-hidden="true">
                  <span className="pk-bezel-screen">{menu.imageUrl ? <img src={menu.imageUrl} alt={t("mb.previewAlt", { name: menu.name })} referrerPolicy="no-referrer" /> : null}</span>
                </button>
                <div className="min-w-0">
                  <h2 className="pk-screen-name">{menu.name}</h2>
                  <p className="pk-screen-meta">{boardKindLabel(menu.template, menu.content, t)} · {t("mb.updated", { ago: timeAgo(menu.updatedAt, t) })}</p>
                  <div className="pk-board-pills">
                    {state.draft ? <StatusPill variant="wait">{t("pl.draft")}</StatusPill> : null}
                    {state.live ? <StatusPill variant="live">{(state.tvs === 1 ? t("peek.menus.liveOnOneTv") : t("peek.menus.liveOnTvs", { n: state.tvs }))}</StatusPill> : <StatusPill variant="asleep">{t("peek.menus.notOnTv")}</StatusPill>}
                    <StatusPill variant="neutral">{t(portrait ? "tpl.orientationVertical" : "tpl.orientationHorizontal")}</StatusPill>
                  </div>
                </div>
                <div className="pk-screen-actions">
                  <PeekButton variant="tint" className="flex-1" onClick={() => onEdit(menu)}>{t("ed.edit")}</PeekButton>
                  <OverflowMenu label={t("screens.moreFor", { name: menu.name })} items={[
                    { id: "delete", label: t("ed.delete"), danger: true, onSelect: () => onDelete(menu) },
                  ]} />
                </div>
              </article>
            </li>
          );
        })}
      </ul>
      {!newDisabled ? <Fab onClick={onNew} label={t("mb.new")} /> : null}
    </div>
  );
}
