/**
 * Menu template catalog for API clients (GET /api/menu-templates/catalog), built from the same source of truth as the
 * web gallery: lib/menu-designer.ts galleryEntries() (order, filters), lib/menu-designs.ts (22 professional templates,
 * variants, sample content, designDocument seeds) and lib/layout-studio.ts (original layouts, sampleLayout seeds).
 * Nothing here is a copy: adding or changing a template on the web changes the catalog and its version.
 *
 * Client-safe (no server imports). The route passes the account's Brand Kit; seeds are branded exactly as the web
 * does when an owner picks a gallery entry (components/menu-templates.tsx DesignGallery + components/menu-boards.tsx):
 * layouts and the classic board are seeded from the kit, templates only take the kit's business name as their title.
 */
import { makeT, type MessageKey } from "@/lib/i18n/index";
import { BOARD_FONT_IDS } from "@/lib/board-fonts";
import { MENU_DESIGNS, designDocument, scratchDocument, type DesignBusiness, type DesignStyle } from "@/lib/menu-designs";
import { galleryEntries, newLayoutDocument, type GalleryEntry, type Structure } from "@/lib/menu-designer";
import { sampleLayout, type LayoutDocument } from "@/lib/layout-studio";
import { sampleMenu, type MenuContent } from "@/lib/menu-templates";
import { seedClassicMenu, type Brand } from "@/lib/brand-kit";
import {
  IMAGE_ZOOM, ITEM_PHOTO_SIZES, designCustomizationSpec, fontWeightsByFont, layoutCustomizationSpec, CUSTOM_VERSION, READABLE_FLOORS, ROLE_KEYS, ROLE_SCALE, SPACING_SCALE,
  TEXT_SCALE, TEXT_SIZE_PRESETS, WEIGHT_CHOICES, type CustomizationSpec,
} from "@/lib/board-custom";

/** Bump when the rendered look of existing templates changes without their definitions changing (renderer fixes). */
export const CATALOG_RENDER_REVISION = 2; // 2: vertical (9:16) drawing and thumbnail `orientation=portrait` (landscape pixels unchanged).
/** The response shape. Bump only on a breaking change; additive fields keep the same schema number. */
export const CATALOG_SCHEMA = 1;

export type Localized = { en: string; es: string };
export type CatalogVariant = { id: string; name: Localized; colors: { paper: string; ink: string; muted: string; accent: string; panel: string; tag: string } };

export type CatalogEntry = {
  /** Stable id: a template id (e.g. "modern-restaurant"), an original layout id (e.g. "two-column"), or "full-screen". */
  id: string;
  /** "template" = professional template, "layout" = original layout, "classic" = classic full-screen menu. */
  kind: "template" | "layout" | "classic";
  name: Localized;
  description: Localized;
  /** Filters, exactly as the web gallery uses them. "any" matches every business filter. */
  business: DesignBusiness | "any";
  style: DesignStyle;
  structure: Structure;
  /** Built around item photos ("Built around photos" filter). */
  photos: boolean;
  /** Relative URL of a public 16:9 PNG preview of the seed (add &w=<px>, 160–1920; default 640). */
  thumbnailPath: string;
  /** Professional templates only: colour styles. The seed uses the first. */
  variants: CatalogVariant[];
  /** Suggested board name: the Brand Kit business name when set, else null (use `name` in the app's language). */
  boardName: string | null;
  /**
   * Guided customization this entry supports (additive): the featured media slider bounds (null = no slider), roles it
   * draws, section heading overrides, spacing and photo focus. Null for the classic board (make a customizable copy).
   */
  customization: CustomizationSpec | null;
  /** How to create a board from this entry. */
  create:
    | { route: "POST /api/layout-studio"; document: LayoutDocument }
    | { route: "POST /api/menus"; template: "classic"; content: MenuContent };
};

export type MenuCatalog = {
  schema: number;
  /** Changes whenever any template definition, name or the render revision changes. Use it to cache. */
  version: string;
  filters: {
    business: { id: DesignBusiness | "all"; name: Localized }[];
    style: { id: DesignStyle | "all"; name: Localized }[];
    structure: { id: Structure | "all"; name: Localized }[];
  };
  fonts: string[];
  /** Shared customization limits (additive). Bounds are clamped by the server too; floors are in canvas px (1920×1080). */
  customization: typeof CUSTOMIZATION_META;
  entries: CatalogEntry[];
  /** "Start from scratch": an empty template board (same seed as the web). */
  scratch: { create: { route: "POST /api/layout-studio"; document: LayoutDocument } };
};

export const CUSTOMIZATION_META = {
  version: CUSTOM_VERSION,
  canvas: { width: 1920, height: 1080 },
  roles: [...ROLE_KEYS],
  textScale: { ...TEXT_SCALE, presets: TEXT_SIZE_PRESETS },
  roleScale: ROLE_SCALE,
  spacingScale: SPACING_SCALE,
  imageFocus: { min: 0, max: 100 },
  /** t421u: featured photo zoom (custom.imageZoom) and item photo size presets (top-level itemPhotoSize). */
  imageZoom: IMAGE_ZOOM,
  itemPhotoSizes: [...ITEM_PHOTO_SIZES],
  weights: [...WEIGHT_CHOICES],
  /** Weight choices each bundled font can draw (others snap to the nearest shipped face at render time). */
  fontWeights: fontWeightsByFont(),
  readableFloors: READABLE_FLOORS,
};

const EN = makeT("en");
const ES = makeT("es");
const both = (key: MessageKey): Localized => ({ en: EN(key), es: ES(key) });

const BUSINESSES: (DesignBusiness | "all")[] = ["all", "restaurant", "cafe", "fast", "bar", "sweets", "salon", "retail", "fitness", "office", "pets"];
const STYLES: (DesignStyle | "all")[] = ["all", "dark", "light", "bold"];
const STRUCTURES: (Structure | "all")[] = ["all", "single", "columns", "media", "cards"];

function entryFor(entry: GalleryEntry, brand: Brand | null, version: string): CatalogEntry {
  const thumbnailPath = `/api/menu-templates/thumbnail/${entry.id}?v=${version}&w=640`;
  const boardName = brand?.displayName?.trim() ? brand.displayName.trim().slice(0, 80) : null;
  const base = { id: entry.id, business: entry.business, style: entry.style, structure: entry.structure, photos: entry.photos, thumbnailPath, boardName };
  if (entry.kind === "design") {
    const d = entry.design;
    return {
      ...base, kind: "template", name: d.name, description: d.blurb,
      variants: d.variants.map((v) => ({ id: v.id, name: v.name, colors: { paper: v.paper, ink: v.ink, muted: v.muted, accent: v.accent, panel: v.panel, tag: v.tag ?? v.accent } })),
      customization: designCustomizationSpec(d.composition),
      // Same as the web: the kit's business name replaces the sample title on templates; nothing else is branded.
      create: { route: "POST /api/layout-studio", document: brandTitle(designDocument(d), brand) },
    };
  }
  if (entry.kind === "layout") {
    return {
      ...base, kind: "layout", name: both(`lo.${entry.id}.name` as MessageKey), description: both(`lo.${entry.id}.blurb` as MessageKey),
      variants: [],
      customization: layoutCustomizationSpec(entry.template),
      create: { route: "POST /api/layout-studio", document: newLayoutDocument(entry.template, brand) },
    };
  }
  return {
    ...base, kind: "classic", name: both("lo.full-screen.name"), description: both("lo.full-screen.blurb"), variants: [], customization: null,
    create: { route: "POST /api/menus", template: "classic", content: seedClassicMenu(sampleMenu(), brand) },
  };
}

function brandTitle(doc: LayoutDocument, brand: Brand | null): LayoutDocument {
  return brand?.displayName ? { ...doc, title: brand.displayName.slice(0, 40) } : doc;
}

/** Same id → same seed document, without any account's Brand Kit (used for thumbnails and the version). */
export function unbrandedSeed(id: string): { kind: "layout-doc"; document: LayoutDocument } | { kind: "classic"; content: MenuContent } | null {
  const entry = galleryEntries().find((e) => e.id === id);
  if (!entry) return null;
  if (entry.kind === "design") return { kind: "layout-doc", document: designDocument(entry.design) };
  if (entry.kind === "layout") return { kind: "layout-doc", document: sampleLayout(entry.template) };
  return { kind: "classic", content: sampleMenu() };
}

/** FNV-1a over the unbranded catalog content; short, stable across servers. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

let cachedVersion: string | null = null;
export function catalogVersion(): string {
  if (cachedVersion) return cachedVersion;
  const unbranded = galleryEntries().map((e) => ({ id: e.id, kind: e.kind, business: e.business, style: e.style, structure: e.structure, photos: e.photos, seed: unbrandedSeed(e.id) }));
  cachedVersion = `${CATALOG_SCHEMA}.${CATALOG_RENDER_REVISION}.${hash(JSON.stringify({ unbranded, designs: MENU_DESIGNS, customization: CUSTOMIZATION_META }))}`;
  return cachedVersion;
}

export function buildCatalog(brand: Brand | null): MenuCatalog {
  const version = catalogVersion();
  return {
    schema: CATALOG_SCHEMA,
    version,
    filters: {
      business: BUSINESSES.map((id) => ({ id, name: both(`tpl.business.${id}` as MessageKey) })),
      style: STYLES.map((id) => ({ id, name: both(`tpl.style.${id}` as MessageKey) })),
      structure: STRUCTURES.map((id) => ({ id, name: both(`tpl.structure.${id}` as MessageKey) })),
    },
    fonts: [...BOARD_FONT_IDS],
    customization: CUSTOMIZATION_META,
    entries: galleryEntries().map((e) => entryFor(e, brand, version)),
    scratch: { create: { route: "POST /api/layout-studio", document: scratchDocument() } },
  };
}
