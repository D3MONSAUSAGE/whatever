import { makeT, type T } from "@/lib/i18n/index";

const EN: T = makeT("en");

/** What the screen is showing right now, including a schedule that overrides the saved assignment. */
export function nowPlaying(
  base: string,
  schedule: { name: string; playlistName: string; untilLabel: string | null } | null | undefined,
  t: T = EN,
  baseIsStatus?: boolean,
) {
  if (!schedule) return base;
  const until = schedule.untilLabel ? t("np.until", { time: schedule.untilLabel }) : "";
  const status = baseIsStatus ?? (!base || base === "No content assigned" || base.startsWith("Waiting"));
  const next = status ? t("np.savedAssignment") : base;
  const title = schedule.playlistName || t("np.aPlaylist");
  return t("np.now", { title, name: schedule.name, until, next });
}

export function clockLabel(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
}

type Named = { id: string; name: string };

/** Group preview names only members. Screens outside the group are a count. */
export function groupPreviewCopy(impact: {
  affected: Named[];
  kept: Named[];
  willBeCleared: Named[];
  overriddenBySchedule: { id: string; name: string; scheduleName: string }[];
  offline: Named[];
}, memberIds: string[], replace: boolean, t: T = EN) {
  const members = new Set(memberIds);
  const inside = <T extends { id: string }>(items: T[]) => items.filter((item) => members.has(item.id));
  const outside = new Set([
    ...impact.kept.filter((item) => !members.has(item.id)).map((item) => item.id),
    ...impact.willBeCleared.filter((item) => !members.has(item.id)).map((item) => item.id),
  ]).size;
  const offline = inside(impact.offline);
  const offlineIds = new Set(offline.map((item) => item.id));
  const affected = [
    ...inside(impact.affected).filter((item) => !offlineIds.has(item.id)),
    ...offline.map((item) => ({ ...item, name: t("np.willUpdate", { name: item.name }) })),
  ];
  return {
    affected,
    unchanged: replace ? [] : inside(impact.willBeCleared),
    willBeCleared: replace ? inside(impact.willBeCleared) : [],
    kept: inside(impact.kept),
    overriddenBySchedule: inside(impact.overriddenBySchedule),
    offline,
    othersLeftAlone: outside,
  };
}

/** Checked ids that are actually in the group. A non-member never gets through. */
export function groupPublishIds(memberIds: string[], chosen: Record<string, boolean>) {
  const members = new Set(memberIds);
  return Object.entries(chosen).filter(([id, on]) => on && members.has(id)).map(([id]) => id);
}
