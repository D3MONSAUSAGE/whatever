"use client";
import { useT } from "@/lib/i18n/client";
import { useState } from "react";
import { useApi, type DisplayItem, type PlaylistSummary, type ScheduleItem, type ScreenGroupItem } from "@/lib/api";
import { DAY_PARTS } from "@/lib/menu-templates";
import { useConfirm } from "@/components/confirm";
import { dayPartSources, DAY_PART_PRIORITY } from "@/lib/day-part-sources";
import { findOverlaps, isOvernight, overnightMessage, type RuleLike } from "@/lib/schedule-checks";
import { useRequiredMessage } from "@/components/ui";

type MenuLite = { id: string; name: string; playlistId?: string | null };
type Part = { enabled: boolean; label: string; start: string; end: string; source: string };

/** Breakfast / lunch / dinner in one form. Creates ordinary schedule rules. */
export function DayPartSetup({ displays, groups, playlists, schedules = [], ask, preview, onSubmit }: {
  displays: DisplayItem[];
  groups: ScreenGroupItem[];
  playlists: PlaylistSummary[];
  schedules?: ScheduleItem[];
  ask?: ReturnType<typeof useConfirm>["ask"];
  preview?: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const t = useT();
  const requiredMsg = useRequiredMessage();
  const menus = useApi<{ menus: MenuLite[] }>(preview ? null : "/api/menus");
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [parts, setParts] = useState<Part[]>(DAY_PARTS.map((p) => ({ enabled: true, label: t(`dp.${p.key}`), start: p.start, end: p.end, source: "" })));
  const [busy, setBusy] = useState(false);
  // QA B2-01 / B2-05: boards that were never published can't play yet, and a published board's
  // own playlist is listed once (as the board), not again under Playlists.
  const sources = dayPartSources(menus.data?.menus ?? [], playlists);
  const [targetKind, targetId] = target.split(":");

  function asRule(part: Part): RuleLike {
    return {
      name: part.label,
      displayId: targetKind === "display" ? targetId : null,
      groupId: targetKind === "group" ? targetId : null,
      weekdays: [1, 2, 3, 4, 5, 6, 7], startTime: part.start, endTime: part.end, startsOn: null, endsOn: null,
      priority: DAY_PART_PRIORITY,
    };
  }
  const chosen = parts.filter((p) => p.enabled);
  const warnings = target ? chosen.flatMap((part) => findOverlaps(asRule(part), schedules, groups, undefined, t).map((item) => `${part.label}: ${item.message}`)) : [];
  const overnightParts = chosen.filter((part) => isOvernight(part.start, part.end));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    for (const part of overnightParts) {
      if (!ask) break;
      const ok = await ask({ title: t("dp.runsOvernight", { part: part.label }), body: overnightMessage(part.start, part.end, t), confirmLabel: t("dp.yesOvernight") });
      if (ok !== true) return;
    }
    const body = {
      ...(targetKind === "group" ? { groupId: targetId } : { displayId: targetId }),
      parts: chosen.map((p) => {
        const [sourceKind, sourceId] = p.source.split(":");
        return { name: p.label, startTime: p.start, endTime: p.end, ...(sourceKind === "menu" ? { menuId: sourceId } : { playlistId: sourceId }) };
      }),
    };
    setBusy(true);
    const ok = await onSubmit(body);
    setBusy(false);
    if (ok) setOpen(false);
  }

  const ready = target && parts.some((p) => p.enabled) && parts.every((p) => !p.enabled || p.source);

  return (
    <div id="day-parts" className="card p-4 md:p-6 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">{t("dp.title")}</h2>
          <p className="text-sm text-muted max-w-xl">{t("dp.lede")}</p>
        </div>
        {!open ? <button className="btn btn-primary" onClick={() => setOpen(true)}>{t("dp.open")}</button> : null}
      </div>
      {open ? (
        <form className="mt-4 grid gap-4" onSubmit={submit} aria-label={t("dp.aria")}>
          <label className="grid gap-1 max-w-sm"><span className="form-label">{t("dp.target")}</span>
            <select className="field" value={target} onChange={(e) => setTarget(e.target.value)} required {...requiredMsg}>
              <option value="">{t("ed.choose")}</option>
              {groups.length ? <optgroup label={t("ed.groups")}>{groups.map((g) => <option key={g.id} value={`group:${g.id}`}>{g.name}</option>)}</optgroup> : null}
              <optgroup label={t("ed.screens")}>{displays.map((d) => <option key={d.id} value={`display:${d.id}`}>{d.name}</option>)}</optgroup>
            </select>
          </label>
          <div className="grid gap-3">
            {parts.map((part, i) => {
              const set = (patch: Partial<Part>) => setParts(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
              return (
                <fieldset key={part.label} className="grid gap-2 sm:grid-cols-[8rem_7rem_7rem_1fr] items-end rounded-xl border border-line p-3">
                  <label className="flex items-center gap-2 font-medium">
                    <input type="checkbox" checked={part.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> {part.label}
                  </label>
                  <label className="grid gap-1"><span className="form-label">{t("dp.starts")}</span>
                    <input className="field" type="time" aria-label={t("dp.startsAria", { part: part.label })} value={part.start} disabled={!part.enabled} onChange={(e) => set({ start: e.target.value })} /></label>
                  <label className="grid gap-1"><span className="form-label">{t("dp.ends")}</span>
                    <input className="field" type="time" aria-label={t("dp.endsAria", { part: part.label })} value={part.end} disabled={!part.enabled} onChange={(e) => set({ end: e.target.value })} /></label>
                  <label className="grid gap-1"><span className="form-label">{t("dp.shows")}</span>
                    <select className="field" aria-label={t("dp.showsAria", { part: part.label })} value={part.source} disabled={!part.enabled} onChange={(e) => set({ source: e.target.value })}>
                      <option value="">{t("ed.choose")}</option>
                      {sources.boards.length ? (
                        <optgroup label={t("ed.menuBoards")}>
                          {sources.boards.map((m) => (
                            <option key={m.id} value={`menu:${m.id}`} disabled={!m.ready}>{m.ready ? m.name : t("dp.publishFirst", { name: m.name })}</option>
                          ))}
                        </optgroup>
                      ) : null}
                      {sources.playlists.length ? <optgroup label={t("ed.playlists")}>{sources.playlists.map((p) => <option key={p.id} value={`playlist:${p.id}`}>{p.name}</option>)}</optgroup> : null}
                    </select>
                  </label>
                </fieldset>
              );
            })}
          </div>
          {sources.boards.some((m) => !m.ready) ? <p className="text-xs text-muted">{t("dp.publishFirstNote")}</p> : null}
          {overnightParts.length ? (
            <p className="note-warn text-sm" role="status">{overnightParts.map((part) => `${part.label}: ${overnightMessage(part.start, part.end, t)}`).join(" ")}</p>
          ) : null}
          {warnings.length ? (
            <div className="note-warn text-sm grid gap-1" role="status" data-testid="day-part-overlaps">
              {warnings.map((text) => <p key={text}>{text}</p>)}
            </div>
          ) : null}
          <p className="text-xs text-muted">{t("dp.footer", { priority: DAY_PART_PRIORITY })}</p>
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={!ready || busy}>{busy ? t("dp.adding") : t("dp.add")}</button>
            <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>{t("ed.cancel")}</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
