/** Shared (client + server) menu-board definitions and validation. */
import { FONT_CHOICE_ERROR, isClassicFont, type BoardFontId } from "@/lib/board-fonts";
import { orientationField, orientationOf, type BoardOrientation } from "@/lib/board-orientation";

export type MenuTemplate = "classic" | "fresh" | "bold";
export type MenuItem = {
  name: string; price: string; description: string;
  /** Optional food photo (same-account image). Absent on every board made before item photos. */
  imageMediaId?: string;
};
export type MenuSection = { name: string; items: MenuItem[] };
export type MenuContent = {
  title: string; subtitle: string; footer: string; sections: MenuSection[]; photoMediaId?: string | null; useBrand?: boolean;
  /**
   * E6-F1: fonts for this board, copied from the Brand Kit when the board is created (never live-linked,
   * so later Brand Kit changes leave existing boards alone). Absent = Inter, exactly as before.
   */
  headingFont?: BoardFontId; bodyFont?: BoardFontId;
  /** Item photos show as thumbnails beside their items unless this is false (hidden; the photos stay on the items). */
  itemPhotos?: boolean;
  /** Vertical boards (t413u): "portrait" draws at 1080×1920. Absent = landscape, exactly as before. */
  orientation?: "portrait";
};

export const MENU_TEMPLATES: { id: MenuTemplate; name: string; blurb: string; swatch: [string, string] }[] = [
  { id: "classic", name: "Classic night", blurb: "Dark navy with blue accents. Easy to read from across the room.", swatch: ["#0b1220", "#4d94ff"] },
  { id: "fresh", name: "Fresh day", blurb: "Bright and clean with a blue header. Great for breakfast and cafés.", swatch: ["#f6f9fe", "#0066ff"] },
  { id: "bold", name: "Bold blue", blurb: "Full Pekko blue with warm price tags that pop.", swatch: ["#0066ff", "#ffd34d"] },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEFAULT_BRAND = { primaryColor: "#0066ff", accentColor: "#ffd34d" } as const;

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return null;
}

export const MENU_LIMITS = {
  name: 80, title: 40, subtitle: 80, footer: 80,
  sections: 4, sectionName: 30, itemsPerSection: 12, items: 24,
  itemName: 40, price: 12, description: 80,
} as const;

export function isMenuTemplate(value: unknown): value is MenuTemplate {
  return value === "classic" || value === "fresh" || value === "bold";
}

function text(value: unknown, max: number): string | null {
  if (value == null) return "";
  if (typeof value !== "string") return null;
  const clean = value.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? null : clean;
}

export function parseMenuContent(input: unknown): { ok: true; value: MenuContent } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Add your menu items." };
  const raw = input as Record<string, unknown>;
  const title = text(raw.title, MENU_LIMITS.title);
  if (title == null) return { ok: false, error: `Keep the title under ${MENU_LIMITS.title} characters.` };
  const subtitle = text(raw.subtitle, MENU_LIMITS.subtitle);
  if (subtitle == null) return { ok: false, error: `Keep the subtitle under ${MENU_LIMITS.subtitle} characters.` };
  const footer = text(raw.footer, MENU_LIMITS.footer);
  if (footer == null) return { ok: false, error: `Keep the footer under ${MENU_LIMITS.footer} characters.` };
  // Emptied sections and blank rows are dropped and do not count toward the limits (QA B1-04).
  if (!Array.isArray(raw.sections) || raw.sections.length > MENU_LIMITS.sections * 3) {
    return { ok: false, error: `Use up to ${MENU_LIMITS.sections} sections.` };
  }
  const sections: MenuSection[] = [];
  let total = 0;
  for (const s of raw.sections) {
    if (!s || typeof s !== "object") return { ok: false, error: "Check your sections." };
    const sec = s as Record<string, unknown>;
    const name = text(sec.name, MENU_LIMITS.sectionName);
    if (name == null) return { ok: false, error: `Keep section names under ${MENU_LIMITS.sectionName} characters.` };
    if (!Array.isArray(sec.items) || sec.items.length > MENU_LIMITS.itemsPerSection * 3) {
      return { ok: false, error: `Use up to ${MENU_LIMITS.itemsPerSection} items per section.` };
    }
    const items: MenuItem[] = [];
    for (const i of sec.items) {
      if (!i || typeof i !== "object") return { ok: false, error: "Check your items." };
      const it = i as Record<string, unknown>;
      const itemName = text(it.name, MENU_LIMITS.itemName);
      const price = text(it.price, MENU_LIMITS.price);
      const description = text(it.description, MENU_LIMITS.description);
      if (itemName == null) return { ok: false, error: `Keep item names under ${MENU_LIMITS.itemName} characters.` };
      if (price == null) return { ok: false, error: `Keep prices under ${MENU_LIMITS.price} characters.` };
      if (description == null) return { ok: false, error: `Keep descriptions under ${MENU_LIMITS.description} characters.` };
      if (!itemName) continue; // blank rows are ignored
      // Item photos are optional and only kept when valid, so items without them parse exactly as before.
      const photo = typeof it.imageMediaId === "string" && UUID.test(it.imageMediaId) ? { imageMediaId: it.imageMediaId.toLowerCase() } : {};
      items.push({ name: itemName, price: price!, description: description!, ...photo });
    }
    if (items.length > MENU_LIMITS.itemsPerSection) return { ok: false, error: `Use up to ${MENU_LIMITS.itemsPerSection} items per section.` };
    total += items.length;
    if (!name && items.length === 0) continue;
    sections.push({ name: name!, items });
  }
  if (sections.length > MENU_LIMITS.sections) return { ok: false, error: `Use up to ${MENU_LIMITS.sections} sections.` };
  if (total > MENU_LIMITS.items) return { ok: false, error: `Use up to ${MENU_LIMITS.items} items in total.` };
  if (!title && total === 0) return { ok: false, error: "Add a title or at least one item." };
  let photoMediaId: string | null = null;
  if (raw.photoMediaId != null && raw.photoMediaId !== "") {
    if (typeof raw.photoMediaId !== "string" || !UUID.test(raw.photoMediaId)) return { ok: false, error: "Choose a photo from your media." };
    photoMediaId = raw.photoMediaId.toLowerCase();
  }
  if (raw.useBrand != null && typeof raw.useBrand !== "boolean") return { ok: false, error: "Use brand has to be true or false." };
  const useBrand = raw.useBrand !== false;
  const fonts: Pick<MenuContent, "headingFont" | "bodyFont"> = {};
  for (const key of ["headingFont", "bodyFont"] as const) {
    const value = raw[key];
    if (value == null || value === "") continue;
    // Classic menus keep the six faces the Android app knows (template/layout boards may use every board font).
    if (!isClassicFont(value)) return { ok: false, error: FONT_CHOICE_ERROR };
    fonts[key] = value;
  }
  if (raw.itemPhotos != null && typeof raw.itemPhotos !== "boolean") return { ok: false, error: "Item photos has to be true or false." };
  const itemPhotos = raw.itemPhotos === false ? { itemPhotos: false } : {};
  return { ok: true, value: { title: title!, subtitle: subtitle!, footer: footer!, sections, photoMediaId, useBrand, ...fonts, ...itemPhotos, ...orientationField(orientationOf(raw)) } };
}

/**
 * PATCH merge for fonts (protects Android +13, which doesn't send them): a font key that is
 * absent from the incoming content keeps the stored value; an explicit null or "" clears it.
 */
export function keepStoredFonts(incoming: unknown, parsed: MenuContent, stored: unknown): MenuContent {
  const raw = incoming && typeof incoming === "object" ? (incoming as Record<string, unknown>) : {};
  const old = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const next: MenuContent = { ...parsed };
  for (const key of ["headingFont", "bodyFont"] as const) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const value = old[key];
    if (isClassicFont(value)) next[key] = value;
  }
  return next;
}

/**
 * PATCH merge for item photos (protects Android and other older clients, which don't know about them).
 * An item that arrives without an `imageMediaId` key keeps the photo stored on the item with the same name in the
 * same section (first match, case-insensitive); an explicit null or "" removes it. The hide setting is kept the same way.
 */
export function keepStoredItemPhotos(incoming: unknown, parsed: MenuContent, stored: unknown): MenuContent {
  const raw = incoming && typeof incoming === "object" ? (incoming as Record<string, unknown>) : {};
  const old = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const oldSections = Array.isArray(old.sections) ? (old.sections as unknown[]) : [];
  const rawSections = Array.isArray(raw.sections) ? (raw.sections as unknown[]) : [];
  const key = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");
  const storedPhotos = (sectionName: string, index: number): Map<string, string> => {
    // Same section by name first, then by position (a renamed section still keeps its photos).
    const byName = oldSections.find((s) => s && typeof s === "object" && key((s as Record<string, unknown>).name) === key(sectionName));
    const section = (byName ?? oldSections[index]) as Record<string, unknown> | undefined;
    const map = new Map<string, string>();
    for (const item of Array.isArray(section?.items) ? (section!.items as unknown[]) : []) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (typeof row.imageMediaId === "string" && UUID.test(row.imageMediaId) && !map.has(key(row.name))) map.set(key(row.name), row.imageMediaId.toLowerCase());
    }
    return map;
  };
  // Incoming items that still carry the key (the web editor sends it on every item) are taken as sent.
  const rawItemsFor = (section: MenuSection) => {
    const match = rawSections.find((s) => s && typeof s === "object" && key((s as Record<string, unknown>).name) === key(section.name));
    const items = match && Array.isArray((match as Record<string, unknown>).items) ? ((match as Record<string, unknown>).items as unknown[]) : [];
    return items.filter((i): i is Record<string, unknown> => Boolean(i && typeof i === "object"));
  };
  const sections = parsed.sections.map((section, si) => {
    const photos = storedPhotos(section.name, si);
    if (!photos.size) return section;
    const sent = rawItemsFor(section);
    return {
      ...section,
      items: section.items.map((item) => {
        const original = sent.find((row) => key(row.name) === key(item.name));
        if (original && Object.prototype.hasOwnProperty.call(original, "imageMediaId")) return item;
        const kept = photos.get(key(item.name));
        return kept && !item.imageMediaId ? { ...item, imageMediaId: kept } : item;
      }),
    };
  });
  const next: MenuContent = { ...parsed, sections };
  if (!Object.prototype.hasOwnProperty.call(raw, "itemPhotos") && old.itemPhotos === false) next.itemPhotos = false;
  return next;
}

export const DAY_PARTS = [
  { key: "breakfast", label: "Breakfast", start: "06:00", end: "11:00" },
  { key: "lunch", label: "Lunch", start: "11:00", end: "17:00" }, // meets Dinner at 5 PM
  { key: "dinner", label: "Dinner", start: "17:00", end: "22:00" }, // 5 PM, after Lunch ends (QA B2-05)
] as const;

export function sampleMenu(): MenuContent {
  return {
    title: "Today's menu",
    subtitle: "Made fresh every day",
    footer: "Ask about our daily specials",
    sections: [
      { name: "Tacos", items: [
        { name: "Al pastor", price: "$3.50", description: "Pork, pineapple, onion, cilantro" },
        { name: "Carne asada", price: "$3.75", description: "Grilled steak, salsa verde" },
        { name: "Pollo", price: "$3.25", description: "" },
      ] },
      { name: "Drinks", items: [
        { name: "Horchata", price: "$2.50", description: "" },
        { name: "Agua fresca", price: "$2.50", description: "" },
      ] },
    ],
  };
}

/**
 * PATCH merge for orientation (t413u): content sent without the `orientation` key keeps the stored orientation, so an
 * older client can never turn a vertical board horizontal. The route refuses content saves to portrait boards from
 * clients without the orientation capability before this runs (lib/board-orientation.ts).
 */
export function keepStoredOrientation(parsed: MenuContent, orientation: BoardOrientation): MenuContent {
  const next: MenuContent = { ...parsed };
  delete next.orientation;
  return orientation === "portrait" ? { ...next, orientation: "portrait" } : next;
}
