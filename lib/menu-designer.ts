/**
 * The unified menu designer: one editor (Business → Menu → Photos → Look) for every board.
 *
 * Three "engines" sit behind the same interface. Each keeps its own storage format, renderer and save path, so
 * existing boards are never converted:
 *   design  → premium template (LayoutDocument with `design`), lib/menu-design-svg.ts, POST /api/layout-studio
 *   layout  → original layout (LayoutDocument without `design`), layoutSvg(), POST /api/layout-studio
 *   classic → full-screen classic menu (MenuContent + theme), lib/menu-classic-svg.ts, POST/PATCH /api/menus
 *
 * The editor works on a LayoutDocument. A classic board is held as a LayoutDocument "working copy" plus the few
 * classic-only settings; `fromClassic` / `toClassic` convert losslessly, so opening and saving a classic board
 * without edits stores exactly what was there.
 */
import { BOARD_FONTS, isBoardFont, type BoardFontId } from "@/lib/board-fonts";
import { MENU_LIMITS, isMenuTemplate, type MenuContent, type MenuTemplate } from "@/lib/menu-templates";
import {
  layoutSvgWithClips, sampleLayout, seedBrand, templateSpec,
  type LayoutDocument, type LayoutSection, type LayoutTemplate,
} from "@/lib/layout-studio";
import { MENU_DESIGNS, designById, isPhotoDesign, type DesignBusiness, type DesignStyle, type MenuDesign } from "@/lib/menu-designs";

export type Engine = "design" | "layout" | "classic";

/** Settings that only a classic board has. Kept exactly as stored so an unedited save changes nothing. */
export type ClassicSettings = {
  theme: MenuTemplate;
  useBrand: boolean;
  headingFont?: BoardFontId;
  bodyFont?: BoardFontId;
};

export function engineOf(doc: LayoutDocument, classic: ClassicSettings | null): Engine {
  if (classic) return "classic";
  return doc.design && designById(doc.design) ? "design" : "layout";
}

/** Classic → working copy. The layout template is irrelevant for classic boards (they draw with menuSvg). */
export function fromClassic(theme: unknown, content: MenuContent): { doc: LayoutDocument; classic: ClassicSettings } {
  const base = sampleLayout("menu-promo-67");
  const classic: ClassicSettings = {
    theme: isMenuTemplate(theme) ? theme : "fresh",
    useBrand: content.useBrand !== false,
    ...(content.headingFont ? { headingFont: content.headingFont } : {}),
    ...(content.bodyFont ? { bodyFont: content.bodyFont } : {}),
  };
  const doc: LayoutDocument = {
    ...base,
    title: content.title,
    subtitle: content.subtitle,
    footer: content.footer,
    sections: content.sections.map((section) => ({
      name: section.name,
      items: section.items.map((item) => ({ name: item.name, price: item.price, description: item.description, ...(item.imageMediaId ? { imageMediaId: item.imageMediaId } : {}) })),
    })),
    imageMediaId: content.photoMediaId ?? null,
    videoMediaId: null,
    featureTitle: "",
    featureDetail: "",
    palette: classic.theme,
    font: classic.headingFont ?? "inter",
    ...(classic.bodyFont ? { bodyFont: classic.bodyFont } : {}),
    ...(content.itemPhotos === false ? { photoStyle: "text" as const } : {}),
  };
  delete (doc as Partial<LayoutDocument>).design;
  return { doc, classic };
}

/** Working copy → classic content. Fonts stay absent unless the owner picked one (absent = Inter, as before). */
export function toClassic(doc: LayoutDocument, classic: ClassicSettings): { template: MenuTemplate; content: MenuContent } {
  // Heading font follows the editor; Inter stays absent unless it was stored explicitly (absent = Inter).
  const headingFont: BoardFontId | undefined = doc.font === "inter" ? (classic.headingFont === "inter" ? "inter" : undefined) : doc.font;
  const bodyFont = doc.bodyFont ?? undefined;
  const content: MenuContent = {
    title: doc.title,
    subtitle: doc.subtitle,
    footer: doc.footer,
    // The web editor sends the item photo key on every item (null when there is none), so the server's
    // keep-stored guard for older clients never brings back a photo the owner removed here.
    sections: doc.sections.map((section) => ({
      name: section.name,
      items: section.items.map((item) => ({ name: item.name, price: item.price, description: item.description, ...(item.imageMediaId ? { imageMediaId: item.imageMediaId } : {}) })),
    })),
    photoMediaId: doc.imageMediaId,
    useBrand: classic.useBrand,
    ...(headingFont && isBoardFont(headingFont) ? { headingFont } : {}),
    ...(bodyFont && isBoardFont(bodyFont) ? { bodyFont } : {}),
    ...(doc.photoStyle === "text" ? { itemPhotos: false } : {}),
  };
  return { template: classic.theme, content };
}

/** Request body for the classic save: every item carries `imageMediaId` (null when none) so removals stick. */
export function classicSaveContent(content: MenuContent): Record<string, unknown> {
  return {
    ...content,
    itemPhotos: content.itemPhotos === false ? false : true,
    sections: content.sections.map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, imageMediaId: item.imageMediaId ?? null })) })),
  };
}

/* ------------------------------------------------------------------ original layouts ------------------------------------------------------------------ */

/** Layouts that show exactly one section per column (sections beyond the columns are not drawn). */
export function fixedColumns(template: LayoutTemplate): number | null {
  if (template === "triple-column") return 3;
  if (template === "two-column" || template === "two-menu-promo") return 2;
  return null;
}

export type LayoutReport = { hiddenSections: number; hiddenItems: number; clipped: string[] };

/** What an original layout can't show: sections past its columns, and item names it shortens with "…". */
export function layoutReport(doc: LayoutDocument, art?: { itemImages?: Record<string, string> }): LayoutReport {
  const cols = fixedColumns(doc.template);
  const extra = cols ? doc.sections.slice(cols).filter((section) => section.items.length > 0) : [];
  const { clipped } = layoutSvgWithClips(doc, art);
  return { hiddenSections: extra.length, hiddenItems: extra.reduce((n, section) => n + section.items.length, 0), clipped };
}

/** Move the sections a column layout can't show into its last column, when they fit (12 items per column). */
export function mergeExtraSections(doc: LayoutDocument): LayoutDocument | null {
  const cols = fixedColumns(doc.template);
  if (!cols || doc.sections.length <= cols) return null;
  const keep = doc.sections.slice(0, cols);
  const extra = doc.sections.slice(cols);
  const last = keep[cols - 1] ?? { name: "", items: [] };
  const items = [...last.items, ...extra.flatMap((section) => section.items)];
  if (items.length > MENU_LIMITS.itemsPerSection) return null;
  const sections: LayoutSection[] = [...keep.slice(0, cols - 1), { name: last.name || extra[0]?.name || "", items }];
  return { ...doc, sections };
}

/**
 * Switch any LayoutDocument (template or original layout) to an original layout, keeping the owner's content,
 * photos, item photos, colours and fonts. Template-only settings are removed; the board then draws with layoutSvg.
 */
export function switchToLayout(doc: LayoutDocument, template: LayoutTemplate): LayoutDocument {
  const spec = templateSpec(template);
  const next: LayoutDocument = { ...doc, template, split: spec.def, columnWidths: null };
  delete next.design;
  delete next.variant;
  delete next.stockPhoto;
  delete next.logoMediaId;
  // Template sample photos on items aren't drawn by original layouts; the owner's own item photos are.
  next.sections = doc.sections.map((section) => ({ ...section, items: section.items.map(({ stockPhoto: _s, ...item }) => { void _s; return item; }) }));
  return next;
}

/** A new original-layout board with its sample content and the account's Brand Kit (as the old editor did). */
export function newLayoutDocument(template: LayoutTemplate, kit?: Parameters<typeof seedBrand>[1]): LayoutDocument {
  return seedBrand(sampleLayout(template), kit);
}

/** Which board area a layout's photo and video use, for the Photos step. */
export function layoutMedia(template: LayoutTemplate): { photo: "feature" | "background" | null; video: boolean; featureText: boolean; exclusive: boolean } {
  if (template === "triple-column" || template === "two-column") return { photo: "background", video: false, featureText: false, exclusive: false };
  if (template === "signature") return { photo: "background", video: true, featureText: true, exclusive: false };
  return { photo: "feature", video: true, featureText: true, exclusive: true };
}

/* ------------------------------------------------------------------ one gallery ------------------------------------------------------------------ */

export type Structure = "single" | "columns" | "media" | "cards";
export type GalleryEntry =
  | { kind: "design"; id: string; design: MenuDesign; business: DesignBusiness | "any"; style: DesignStyle; photos: boolean; structure: Structure; original: false }
  | { kind: "layout"; id: string; template: LayoutTemplate; business: "any"; style: DesignStyle; photos: boolean; structure: Structure; original: true }
  | { kind: "classic"; id: "full-screen"; business: "any"; style: DesignStyle; photos: boolean; structure: Structure; original: true };

const DESIGN_STRUCTURE: Record<MenuDesign["composition"], Structure> = {
  showcase: "media", columns: "columns", promo: "media", list: "columns", cards: "cards", featured: "cards",
};

/** The original layouts, in the order the previous layout picker showed them (option ids match LAYOUT_OPTIONS). */
export const ORIGINAL_LAYOUTS: { id: string; template: LayoutTemplate; structure: Structure }[] = [
  { id: "two-column", template: "two-column", structure: "columns" },
  { id: "menu-promo", template: "menu-promo-67", structure: "media" },
  { id: "two-menu-promo", template: "two-menu-promo", structure: "columns" },
  { id: "triple-column", template: "triple-column", structure: "columns" },
  { id: "split-50", template: "split-50", structure: "media" },
  { id: "menu-banner", template: "menu-banner", structure: "single" },
  { id: "signature", template: "signature", structure: "media" },
];

export function galleryEntries(): GalleryEntry[] {
  const designs: GalleryEntry[] = MENU_DESIGNS.map((design) => ({
    kind: "design", id: design.id, design, business: design.business, style: design.style,
    photos: isPhotoDesign(design), structure: DESIGN_STRUCTURE[design.composition], original: false,
  }));
  const layouts: GalleryEntry[] = ORIGINAL_LAYOUTS.map((layout) => ({
    // Every original layout can show item photos as thumbnails; none is built around them.
    kind: "layout", id: layout.id, template: layout.template, business: "any", style: "light", photos: false, structure: layout.structure, original: true,
  }));
  const classic: GalleryEntry = { kind: "classic", id: "full-screen", business: "any", style: "dark", photos: false, structure: "single", original: true };
  return [...designs, classic, ...layouts];
}

export type GalleryFilter = { business: DesignBusiness | "all"; style: DesignStyle | "all"; photos: boolean; structure: Structure | "all" };

export function filterGallery(entries: GalleryEntry[], f: GalleryFilter): GalleryEntry[] {
  return entries.filter((entry) =>
    (f.business === "all" || entry.business === f.business || entry.business === "any")
    && (f.style === "all" || entry.style === f.style)
    && (!f.photos || entry.photos)
    && (f.structure === "all" || entry.structure === f.structure));
}

export const FONT_IDS = BOARD_FONTS.map((font) => font.id);
