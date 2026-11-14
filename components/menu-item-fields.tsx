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
