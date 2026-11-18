/**
 * Per-item photo helpers shared by the guided editor and tests. A photo lives on its item
 * (`item.imageMediaId`, or a template sample `item.stockPhoto`), so every operation here moves or copies
 * whole item objects: photos always travel with their item.
 */
import { MENU_LIMITS, type LayoutSection } from "@/lib/layout-studio";

function clone(sections: LayoutSection[]): LayoutSection[] {
  return sections.map((section) => ({ ...section, items: section.items.map((item) => ({ ...item })) }));
}

/** Set (or remove, with null) the owner's photo on one item. A template sample photo is replaced either way. */
export function withItemPhoto(sections: LayoutSection[], si: number, ii: number, imageMediaId: string | null): LayoutSection[] {
  const next = clone(sections);
  const item = next[si]?.items[ii];
  if (!item) return sections;
  delete item.stockPhoto;
  if (imageMediaId) item.imageMediaId = imageMediaId;
  else delete item.imageMediaId;
  return next;
}

/** Move an item up or down; at a section edge it moves into the neighbouring section (end of the previous, start of the next). */
export function moveItem(sections: LayoutSection[], si: number, ii: number, dir: -1 | 1): LayoutSection[] {
  const next = clone(sections);
  const items = next[si]?.items;
  if (!items || !items[ii]) return sections;
  const target = ii + dir;
  if (target >= 0 && target < items.length) {
    [items[ii], items[target]] = [items[target], items[ii]];
    return next;
  }
  const neighbour = next[si + dir];
  if (!neighbour || neighbour.items.length >= MENU_LIMITS.itemsPerSection) return sections;
  const [moved] = items.splice(ii, 1);
  if (dir < 0) neighbour.items.push(moved);
  else neighbour.items.unshift(moved);
  return next;
}

/** Split off the last `count` items (reading order) into a second board's sections. Nothing is lost. */
export function splitLastItems(sections: LayoutSection[], count: number): { kept: LayoutSection[]; moved: LayoutSection[] } {
  const kept = clone(sections);
  const moved: LayoutSection[] = [];
  let left = count;
  for (let si = kept.length - 1; si >= 0 && left > 0; si--) {
    const take = Math.min(left, kept[si].items.length);
    const items = kept[si].items.splice(kept[si].items.length - take, take);
    if (items.length) moved.unshift({ name: kept[si].name, items });
    left -= take;
  }
  return { kept: kept.filter((section) => section.items.length || section.name), moved };
}

/** Every owner photo id on a board (for ownership checks and loading). */
export function itemPhotoIds(sections: LayoutSection[]): string[] {
  return [...new Set(sections.flatMap((section) => section.items.map((item) => item.imageMediaId).filter((id): id is string => Boolean(id))))];
}
