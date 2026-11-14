/**
 * Editor-side helpers for menu item fields (QA cycle 1: B1-01, B1-02, B1-04, U1-05).
 * Nothing here changes stored boards: prices are only tidied when the owner leaves a
 * price field, and free text such as "Market price" is kept exactly as typed.
 */
import { MENU_LIMITS } from "@/lib/menu-templates";

type Item = { name: string; price: string; description: string };
type Section = { name: string; items: Item[] };

const PLAIN_PRICE = /^\$?\s*(\d{1,6})(?:\.(\d{1,2}))?$/;

/**
 * Tidy a typed price when the field loses focus.
 * "12" -> "$12", "12.5" / "$12.5" -> "$12.50", "$ 9.9" -> "$9.90".
 * Anything else ("Market price", "2 for $10", "€8", "abc") is returned unchanged.
 */
export function normalizePrice(raw: string): string {
  const value = raw.trim();
  const match = PLAIN_PRICE.exec(value);
  if (!match) return raw;
  const [, whole, cents] = match;
  const dollars = String(Number(whole));
  if (cents == null) return `$${dollars}`;
  return `$${dollars}.${cents.padEnd(2, "0")}`;
}

/** A gentle, non-blocking hint for a price that is not a plain number. Saves are never blocked. */
export function priceHint(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (PLAIN_PRICE.test(value)) return null;
  if (/^[$€£¥]\s*\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
  return "Not a number, so it shows on the board exactly as typed (fine for \"Market price\").";
}

/** A row that has a price or description but no name. Saving would drop it, so we ask for a name. */
export function needsName(item: Item): boolean {
  return !item.name.trim() && Boolean(item.price.trim() || item.description.trim());
}

export function firstNamelessItem(sections: Section[]): { section: number; item: number } | null {
  for (let s = 0; s < sections.length; s++) {
    for (let i = 0; i < sections[s].items.length; i++) {
      if (needsName(sections[s].items[i])) return { section: s, item: i };
    }
  }
  return null;
}

export const ITEM_NAME_REQUIRED = "Item name required. Add a name or remove this item.";

/** Rows that will be kept on save (named items). Blank rows are ignored. */
export function filledItems(section: Section): number {
  return section.items.filter((item) => item.name.trim()).length;
}

/** Sections that count toward the limit: a name or at least one named item. Emptied sections do not count. */
export function filledSections(sections: Section[]): number {
  return sections.filter((section) => section.name.trim() || filledItems(section) > 0).length;
}

export function menuCounts(sections: Section[]) {
  const items = sections.reduce((n, section) => n + filledItems(section), 0);
  const rows = sections.reduce((n, section) => n + section.items.length, 0);
  return {
    sections: filledSections(sections),
    sectionRows: sections.length,
    items,
    rows,
    maxSections: MENU_LIMITS.sections,
    maxItems: MENU_LIMITS.items,
    maxPerSection: MENU_LIMITS.itemsPerSection,
  };
}

/** Whether another section row can be added (rows, not just filled ones, so the editor never shows more than the limit). */
export function canAddSection(sections: Section[]): boolean {
  return sections.length < MENU_LIMITS.sections;
}

/** Whether another item row can be added to one section. */
export function canAddItem(sections: Section[], sectionIndex: number): boolean {
  const section = sections[sectionIndex];
  if (!section) return false;
  const rows = sections.reduce((n, s) => n + s.items.length, 0);
  return section.items.length < MENU_LIMITS.itemsPerSection && rows < MENU_LIMITS.items;
}

/** Drop rows the board would not show (no name), for previews only. Stored content is not changed. */
export function withoutNamelessItems<T extends { sections: Section[] }>(doc: T): T {
  return { ...doc, sections: doc.sections.map((section) => ({ ...section, items: section.items.filter((item) => item.name.trim()) })) };
}

export function charCount(value: string, max: number): string {
  return `${value.length}/${max}`;
}

/** Styles for the shared item notes, injected by StudioStyles. */
export const MENU_FIELD_STYLES = `
        .item-card .item-order { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 6px; margin-top: -2px; }
        .section-order { display: inline-flex; gap: 6px; flex: 0 0 auto; }
        .order-btn { border: 1px solid #d5dae3; background: #fff; color: #1f2937; font: inherit; font-size: 12px; font-weight: 650; min-height: 32px; min-width: 44px; padding: 0 10px; border-radius: 8px; cursor: pointer; }
        .order-btn:hover:not(:disabled) { background: #f2f5fa; }
        .order-btn:disabled { opacity: .4; cursor: default; }
        .item-card .item-note { grid-column: 1 / -1; margin: -2px 0 0; font-size: 12px; line-height: 1.35; }
        .item-card .item-note-error { color: #b42318; font-weight: 650; }
        .item-card .item-note-hint { color: #7a5b00; }
        .item-card .item-count { color: #5c6474; text-align: right; font-variant-numeric: tabular-nums; }
        .item-card .item-count-near { color: #b54708; font-weight: 650; }
        .item-card .item-name[aria-invalid="true"] { border-color: #b42318; box-shadow: 0 0 0 1px #b42318; }
        .menu-limits { margin: 0 0 8px; font-size: 12px; color: #5c6474; }
        .item-add:disabled { opacity: .55; cursor: not-allowed; }
        .classic-add-photo { position: absolute; right: 10px; bottom: 10px; z-index: 2; min-height: 36px; padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,.85); background: rgba(11,18,32,.72); color: #fff; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
        .classic-add-photo:hover { background: rgba(11,18,32,.88); }
        .classic-add-photo:focus-visible { outline: 3px solid #0066ff; outline-offset: 2px; }
        .item-limit { margin: 6px 0 0; font-size: 12px; color: #5c6474; }
`;

/** Move one entry up (-1) or down (+1); out-of-range moves return the same array (E1). */
export function moveEntry<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** Move a section up or down. Items travel with it. */
export function moveSection<S>(sections: S[], si: number, dir: -1 | 1): S[] {
  return moveEntry(sections, si, dir);
}

/** Move an item up or down inside its own section. */
export function moveItem<S extends { items: I[] }, I>(sections: S[], si: number, ii: number, dir: -1 | 1): S[] {
  return sections.map((section, i) => (i === si ? { ...section, items: moveEntry(section.items, ii, dir) } : section));
}
