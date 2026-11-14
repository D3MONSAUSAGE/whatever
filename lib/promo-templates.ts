/** Shared (client + server) promo-slide definitions and validation (M12). */
import type { MenuTemplate } from "./menu-templates";

export type PromoTemplate = "happy" | "deal" | "special";
export type PromoContent = {
  tag: string; headline: string; subheadline: string; price: string; details: string; footer: string;
  photoMediaId?: string | null; useBrand?: boolean;
};

export const PROMO_TEMPLATES: { id: PromoTemplate; name: string; blurb: string; base: MenuTemplate; sample: PromoContent; swatch: [string, string] }[] = [
  {
    id: "happy", name: "Happy hour", blurb: "Bold colour with a big price tag.", base: "bold", swatch: ["#0066ff", "#ffd34d"],
    sample: { tag: "Happy hour", headline: "[Your drink deal]", subheadline: "[What's included]", price: "[$0]", details: "[Which days, where]", footer: "[Hours]", useBrand: true },
  },
  {
    id: "deal", name: "Deal", blurb: "Bright and clean. Great for 2-for-1s and combos.", base: "fresh", swatch: ["#f6f9fe", "#0066ff"],
    sample: { tag: "Deal", headline: "[Your combo]", subheadline: "[What's in it]", price: "[$0]", details: "", footer: "[Fine print]", useBrand: true },
  },
  {
    id: "special", name: "Today's special", blurb: "Dark and elegant. Made for a photo of the dish.", base: "classic", swatch: ["#0b1220", "#4d94ff"],
    sample: { tag: "Today's special", headline: "[Dish name]", subheadline: "[Short description]", price: "[$0]", details: "", footer: "[Ask your server]", useBrand: true },
  },
];

export const PROMO_LIMITS = { name: 80, tag: 24, headline: 40, subheadline: 80, price: 12, details: 120, footer: 60 } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPromoTemplate(value: unknown): value is PromoTemplate {
  return value === "happy" || value === "deal" || value === "special";
}
export function promoBase(template: PromoTemplate): MenuTemplate {
  return PROMO_TEMPLATES.find((t) => t.id === template)!.base;
}
/**
 * New promos start with clearly marked placeholders in [brackets] (QA U2-04), so a realistic-looking
 * deal is never published by accident. Saved promos keep whatever they already say.
 */
const PLACEHOLDER = /^\[.*\]$/;
const FIELD_NAMES: Record<string, string> = { headline: "headline", subheadline: "subheadline", price: "price", details: "details", footer: "bottom line" };
export function placeholderFields(content: PromoContent): string[] {
  return (Object.keys(FIELD_NAMES) as (keyof PromoContent)[]).filter((key) => typeof content[key] === "string" && PLACEHOLDER.test((content[key] as string).trim())).map((key) => FIELD_NAMES[key as string]);
}

export function samplePromo(template: PromoTemplate = "happy"): PromoContent {
  return { ...PROMO_TEMPLATES.find((t) => t.id === template)!.sample };
}

function text(value: unknown, max: number): string | null {
  if (value == null) return "";
  if (typeof value !== "string") return null;
  const clean = value.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? null : clean;
}

const LABELS: Record<keyof typeof PROMO_LIMITS, string> = { name: "name", tag: "label", headline: "headline", subheadline: "subheadline", price: "price", details: "details", footer: "footer" };

export function parsePromoContent(input: unknown): { ok: true; value: PromoContent } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Add a headline." };
  const raw = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of ["tag", "headline", "subheadline", "price", "details", "footer"] as const) {
    const v = text(raw[key], PROMO_LIMITS[key]);
    if (v == null) return { ok: false, error: `Keep the ${LABELS[key]} under ${PROMO_LIMITS[key]} characters.` };
    out[key] = v;
  }
  if (!out.headline) return { ok: false, error: "Add a headline." };
  const photo = raw.photoMediaId;
  if (photo != null && (typeof photo !== "string" || !UUID.test(photo))) return { ok: false, error: "Choose a photo from your media." };
  if (raw.useBrand != null && typeof raw.useBrand !== "boolean") return { ok: false, error: "Use my brand has to be on or off." };
  return {
    ok: true,
    value: {
      tag: out.tag, headline: out.headline, subheadline: out.subheadline, price: out.price, details: out.details, footer: out.footer,
      photoMediaId: (photo as string | null | undefined) ?? null, useBrand: raw.useBrand !== false,
    },
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Optional inclusive dates (YYYY-MM-DD). */
export function parsePromoDates(startsOn: unknown, endsOn: unknown): { ok: true; startsOn: string | null; endsOn: string | null } | { ok: false; error: string } {
  const one = (v: unknown) => {
    if (v == null || v === "") return null;
    if (typeof v !== "string" || !DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) return "invalid";
    return v;
  };
  const s = one(startsOn), e = one(endsOn);
  if (s === "invalid" || e === "invalid") return { ok: false, error: "Use dates like 2026-11-01, or leave them blank." };
  if (s && e && e < s) return { ok: false, error: "The end date is before the start date." };
  return { ok: true, startsOn: s, endsOn: e };
}
