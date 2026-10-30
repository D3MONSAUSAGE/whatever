/** Shared (client + server) menu-board definitions and validation. */

export type MenuTemplate = "classic" | "fresh" | "bold";
export type MenuItem = { name: string; price: string; description: string };
export type MenuSection = { name: string; items: MenuItem[] };
export type MenuContent = { title: string; subtitle: string; footer: string; sections: MenuSection[] };

export const MENU_TEMPLATES: { id: MenuTemplate; name: string; blurb: string; swatch: [string, string] }[] = [
  { id: "classic", name: "Classic night", blurb: "Dark navy with blue accents. Easy to read from across the room.", swatch: ["#0b1220", "#4d94ff"] },
  { id: "fresh", name: "Fresh day", blurb: "Bright and clean with a blue header. Great for breakfast and cafés.", swatch: ["#f6f9fe", "#0066ff"] },
  { id: "bold", name: "Bold blue", blurb: "Full Seemple blue with warm price tags that pop.", swatch: ["#0066ff", "#ffd34d"] },
];

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
  if (!Array.isArray(raw.sections) || raw.sections.length > MENU_LIMITS.sections) {
    return { ok: false, error: `Use up to ${MENU_LIMITS.sections} sections.` };
  }
  const sections: MenuSection[] = [];
  let total = 0;
  for (const s of raw.sections) {
    if (!s || typeof s !== "object") return { ok: false, error: "Check your sections." };
    const sec = s as Record<string, unknown>;
    const name = text(sec.name, MENU_LIMITS.sectionName);
    if (name == null) return { ok: false, error: `Keep section names under ${MENU_LIMITS.sectionName} characters.` };
    if (!Array.isArray(sec.items) || sec.items.length > MENU_LIMITS.itemsPerSection) {
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
      items.push({ name: itemName, price: price!, description: description! });
    }
    total += items.length;
    if (!name && items.length === 0) continue;
    sections.push({ name: name!, items });
  }
  if (total > MENU_LIMITS.items) return { ok: false, error: `Use up to ${MENU_LIMITS.items} items in total.` };
  if (!title && total === 0) return { ok: false, error: "Add a title or at least one item." };
  return { ok: true, value: { title: title!, subtitle: subtitle!, footer: footer!, sections } };
}

export const DAY_PARTS = [
  { key: "breakfast", label: "Breakfast", start: "06:00", end: "11:00" },
  { key: "lunch", label: "Lunch", start: "11:00", end: "16:00" },
  { key: "dinner", label: "Dinner", start: "16:00", end: "22:00" },
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
