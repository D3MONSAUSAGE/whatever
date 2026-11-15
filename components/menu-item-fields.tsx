"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
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

/**
 * MB-1: one menu item shown as a product card (both editors). The summary row shows the item as typed:
 * thumbnail on the left, name, description under it, and the price. Clicking the card (or Edit) opens the
 * existing name / price / description fields underneath; every keystroke still goes straight into the draft,
 * so the live TV preview keeps updating and Save/Publish work as before. Menu items have no photo of their
 * own in the menu data, so the thumbnail is always a placeholder (the item's initial). Nothing about the
 * stored menu or the TV layouts changes.
 */
/** Up to two initials from the item name ("Carne asada" → "CA"), for the placeholder tile. */
export function itemInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const first = (w: string) => Array.from(w.replace(/^[^\p{L}\p{N}]+/u, ""))[0] ?? "";
  return words.slice(0, 2).map(first).join("").toLocaleUpperCase();
}

/**
 * The fixed square image slot on a product card. Shows an image when one is given (future MB-2),
 * otherwise an initials tile, or a plate icon for an unnamed item. Same size either way, so an
 * image can drop in later without changing the card layout.
 */
export function ProductThumb({ name, imageSrc = null }: { name: string; imageSrc?: string | null }) {
  const initials = itemInitials(name);
  if (imageSrc) {
    return (
      <span className="product-thumb has-image" aria-hidden="true">
        <img src={imageSrc} alt="" loading="lazy" decoding="async" />
      </span>
    );
  }
  return (
    <span className={`product-thumb${initials ? "" : " is-empty"}`} aria-hidden="true" data-testid="product-thumb">
      {initials || (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="12" cy="13" r="6.5" /><path d="M3 6v5M5 6v5M4 11v8M20 6c-1.5 1-2 3-2 5h2v8" />
        </svg>
      )}
    </span>
  );
}

export function ProductCard({ item, idBase, open, onToggle, onRemove, removeLabel, order, children, imageSrc = null }: {
  item: { name: string; price: string; description: string };
  /** Reserved for per-item images (MB-2). Nothing passes it today; menu items have no image field. */
  imageSrc?: string | null;
  idBase: string;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
  removeLabel: string;
  order: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useT();
  const name = item.name.trim();
  const price = item.price.trim();
  const desc = item.description.trim();
  const shown = name || t("menuCard.unnamed");
  const toggle = () => {
    const opening = !open;
    onToggle();
    if (opening) requestAnimationFrame(() => document.getElementById(`${idBase}-name`)?.focus());
  };
  return (
    <div className={`product-card${open ? " is-open" : ""}`} data-testid="product-card">
      <div className="product-row">
        <ProductThumb name={name} imageSrc={imageSrc} />
        {/* The whole text area opens the card for mouse and touch; the Edit button is the keyboard control. */}
        <div className="product-main" onClick={toggle}>
          <span className={`product-name${name ? "" : " is-placeholder"}`}>{shown}</span>
          {desc ? <span className="product-desc">{desc}</span> : null}
        </div>
        <span className={`product-price${price ? "" : " is-empty"}`} onClick={toggle}>{price || t("menuCard.noPrice")}</span>
        <div className="product-actions">
          <button type="button" className="product-edit" aria-expanded={open} aria-controls={`${idBase}-edit`}
            aria-label={open ? t("menuCard.doneLabel", { name: shown }) : t("menuCard.editLabel", { name: shown })} onClick={toggle}>
            {open ? t("menuCard.done") : t("menuCard.edit")}
          </button>
          <button type="button" className="item-remove" aria-label={removeLabel} onClick={onRemove}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>
      {order}
      {open ? <div className="item-card product-editor" id={`${idBase}-edit`}>{children}</div> : null}
    </div>
  );
}

/**
 * Which product card is open, per editor. Index keys follow the item on moves and close on removes,
 * so an open card never jumps to a different item.
 */
export function useOpenItem() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const key = (si: number, ii: number) => `${si}:${ii}`;
  return {
    isOpen: (si: number, ii: number) => openKey === key(si, ii),
    toggle: (si: number, ii: number) => setOpenKey((k) => (k === key(si, ii) ? null : key(si, ii))),
    open: (si: number, ii: number) => setOpenKey(key(si, ii)),
    moved: (si: number, ii: number, dir: -1 | 1) => setOpenKey((k) => {
      if (k === key(si, ii)) return key(si, ii + dir);
      if (k === key(si, ii + dir)) return key(si, ii);
      return k;
    }),
    sectionMoved: (si: number, dir: -1 | 1) => setOpenKey((k) => {
      if (!k) return k;
      const [s, i] = k.split(":").map(Number);
      if (s === si) return key(si + dir, i!);
      if (s === si + dir) return key(si, i!);
      return k;
    }),
    clear: () => setOpenKey(null),
  };
}
