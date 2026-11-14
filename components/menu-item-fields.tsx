"use client";

import { charCount, ITEM_NAME_REQUIRED, needsName, priceHint } from "@/lib/menu-fields";
import { MENU_LIMITS } from "@/lib/menu-templates";

type Item = { name: string; price: string; description: string };

/**
 * Notes under one menu item row, shared by both editors (QA B1-01, B1-02, U1-05):
 * a required-name message, a gentle price hint (never blocks saving) and a description counter.
 */
export function ItemNotes({ item, idBase, showNameError }: { item: Item; idBase: string; showNameError: boolean }) {
  const nameError = showNameError && needsName(item);
  const hint = priceHint(item.price);
  const descLength = item.description.length;
  return (
    <>
      {nameError ? <p className="item-note item-note-error" id={`${idBase}-name-error`} role="alert">{ITEM_NAME_REQUIRED}</p> : null}
      {hint ? <p className="item-note item-note-hint" id={`${idBase}-price-hint`}>{hint}</p> : null}
      {descLength > 0 ? (
        <p className={`item-note item-count${descLength >= MENU_LIMITS.description - 8 ? " item-count-near" : ""}`} id={`${idBase}-desc-count`} aria-live="polite">
          {charCount(item.description, MENU_LIMITS.description)}
          {descLength >= MENU_LIMITS.description ? " · limit reached" : ""}
        </p>
      ) : null}
    </>
  );
}

/** "Sections 2 of 4 · Items 14 of 24", shown above the sections so limits are known up front (QA B1-04). */
export function MenuLimits({ sections, items, maxSections, maxItems, columns }: { sections: number; items: number; maxSections: number; maxItems: number; columns?: boolean }) {
  return (
    <p className="menu-limits" data-testid="menu-limits">
      {columns ? null : <>Sections {sections} of {maxSections} · </>}Items {items} of {maxItems}
      {columns ? null : <> · up to {MENU_LIMITS.itemsPerSection} per section</>}
    </p>
  );
}

/** Accessible name for one move button, e.g. Move "Fish Tacos" up (item 2 of 5). */
export function orderLabel(kind: "item" | "section", name: string, index: number, count: number, dir: -1 | 1): string {
  const shown = name.trim() ? `“${name.trim()}”` : `unnamed ${kind}`;
  return `Move ${shown} ${dir < 0 ? "up" : "down"} (${kind} ${index + 1} of ${count})`;
}

/** After a move, which button keeps focus: the same direction on the moved row, or the other one once it reaches an end. */
export function focusAfterMove(index: number, dir: -1 | 1, count: number): { index: number; dir: -1 | 1 } {
  const to = Math.max(0, Math.min(count - 1, index + dir));
  const atEnd = (dir < 0 && to === 0) || (dir > 0 && to === count - 1);
  return { index: to, dir: atEnd ? (dir < 0 ? 1 : -1) : dir };
}

/**
 * Up/Down buttons for an item or a section (E1). No drag and drop.
 * Rows use index keys, so after a move focus follows the moved row to its new place (Gother PR93 review).
 */
export function OrderButtons({ kind, name, scope, index, count, onMove, className = "item-order" }: {
  kind: "item" | "section";
  name: string;
  /** Unique per list, e.g. "classic-items-0". */
  scope: string;
  index: number;
  count: number;
  onMove: (dir: -1 | 1) => void;
  className?: string;
}) {
  if (count < 2) return null;
  const move = (dir: -1 | 1) => {
    onMove(dir);
    const next = focusAfterMove(index, dir, count);
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLButtonElement>(`[data-order-scope="${scope}"][data-order-index="${next.index}"][data-order-dir="${next.dir}"]`);
      target?.focus();
    });
  };
  const button = (dir: -1 | 1) => (
    <button type="button" className="order-btn" aria-label={orderLabel(kind, name, index, count, dir)}
      data-order-scope={scope} data-order-index={index} data-order-dir={dir}
      disabled={dir < 0 ? index === 0 : index === count - 1} onClick={() => move(dir)}>{dir < 0 ? "↑ Up" : "↓ Down"}</button>
  );
  return (
    <div className={className} role="group" aria-label={`Order of ${kind} ${index + 1}`}>
      {button(-1)}
      {button(1)}
    </div>
  );
}
