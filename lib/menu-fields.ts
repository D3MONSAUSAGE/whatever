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

/** Sections that count toward the limit: at least one named item. A section with no items never counts, whatever its name (QA B1-04 retest). */
export function filledSections(sections: Section[]): number {
  return sections.filter((section) => filledItems(section) > 0).length;
}

/** Whether a section appears on the board: it needs at least one named item. Its name alone never shows a heading. */
export function sectionShows(section: Section): boolean {
  return filledItems(section) > 0;
}

/** Sections the board draws, in order. Sections with items are never dropped. Stored content is not changed. */
export function shownSections<S extends Section>(sections: S[]): S[] {
  return sections.filter(sectionShows);
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

/** Message when no more section rows fit. Points at an empty section when there is one (QA B1-04 retest). */
export function sectionLimitMessage(sections: Section[]): string {
  const empty = sections.findIndex((section) => !sectionShows(section));
  return empty >= 0
    ? `${MENU_LIMITS.sections} sections is the limit. Section ${empty + 1} is empty and isn't shown; remove it to add another.`
    : `${MENU_LIMITS.sections} sections is the limit. Remove one to add another.`;
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
        /* MB-1 product cards: thumbnail left, name over description, price right; fields open underneath. */
        .product-card { container-type: inline-size; background: #fff; border: 1px solid #e4e8f0; border-radius: 14px; padding: 10px; margin: 8px 0; box-shadow: 0 1px 2px rgba(15,23,42,.04); min-width: 0; transition: border-color .15s, box-shadow .15s; }
        .product-card:hover { border-color: #cfd7e4; }
        .product-card.is-open { border-color: #9cc0ff; box-shadow: 0 0 0 3px rgba(0,102,255,.10); }
        .product-row { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto auto; grid-template-areas: "thumb main price actions"; align-items: center; gap: 12px; min-width: 0; }
        .product-thumb { grid-area: thumb; width: 56px; height: 56px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #eef4ff, #e3ecfb); color: #2a4f8f; font-size: 19px; font-weight: 750; letter-spacing: .01em; border: 1px solid #dfe7f5; flex: 0 0 auto; overflow: hidden; user-select: none; }
        .product-thumb.has-image { background: #f3f5f9; padding: 0; }
        .product-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .product-thumb.is-empty { color: #8a96ab; background: #f3f5f9; border-style: dashed; }
        .product-main { grid-area: main; min-width: 0; display: grid; gap: 2px; cursor: pointer; }
        .product-name { font-size: 15px; font-weight: 700; color: #0f172a; line-height: 1.3; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .product-name.is-placeholder { color: #8a96ab; font-weight: 600; font-style: italic; }
        .product-desc { font-size: 13px; color: #5c6474; line-height: 1.4; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .product-price { grid-area: price; font-size: 15px; font-weight: 750; color: #0f172a; font-variant-numeric: tabular-nums; white-space: nowrap; max-width: 9ch; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
        .product-price.is-empty { font-size: 12px; font-weight: 600; color: #8a96ab; }
        .product-actions { grid-area: actions; display: inline-flex; align-items: center; gap: 2px; }
        .product-edit { border: 1px solid #d5dae3; background: #fff; color: #1f2937; font: inherit; font-size: 13px; font-weight: 650; min-height: 36px; min-width: 56px; padding: 0 12px; border-radius: 999px; cursor: pointer; }
        .product-edit:hover { background: #f2f5fa; }
        .product-card.is-open .product-edit { background: #0066ff; border-color: #0066ff; color: #fff; }
        .product-edit:focus-visible, .product-card .item-remove:focus-visible { outline: 3px solid #0066ff; outline-offset: 2px; }
        .product-card .item-remove { width: 44px; height: 44px; border: 0; background: transparent; color: #8a3a32; font-size: 22px; line-height: 1; border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
        .product-card .item-remove:hover { background: #fdecea; }
        .product-card .product-order { display: flex; justify-content: flex-end; gap: 6px; margin: 6px 0 0; }
        .product-card .product-editor { grid-template-columns: minmax(0, 1fr) 104px; border-top: 1px solid #eef1f6; margin-top: 10px; padding: 10px 0 0; border-bottom: 0; }
        .product-card .product-editor .item-desc { grid-column: 1 / -1; }
        @container (max-width: 380px) {
          .product-row { grid-template-columns: 48px minmax(0, 1fr) auto; grid-template-areas: "thumb main main" "thumb price actions"; row-gap: 6px; align-items: start; }
          .product-thumb { width: 48px; height: 48px; font-size: 16px; }
          .product-price { align-self: center; max-width: none; }
          .product-actions { justify-self: end; }
          .product-card .product-editor { grid-template-columns: minmax(0, 1fr); }
          .product-card .product-editor .item-name, .product-card .product-editor .item-price { grid-column: 1; }
          .product-card .product-editor .item-price { text-align: left; }
        }
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
