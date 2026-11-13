import { MENU_LIMITS, normalizeHex, type MenuContent, type MenuTemplate } from "@/lib/menu-templates";
import type { MediaItem } from "@/lib/api";

/** JPG or PNG images that can go on a menu (logos and photos). Menu slides themselves are left out. */
export function artImages(media: MediaItem[] | null | undefined) {
  return (media ?? []).filter((m) => m.kind !== "video" && /\.(png|jpe?g)$/i.test(m.fileName) && !/\((menu|promo)\)\.png$/.test(m.fileName));
}

/** Fonts Layout documents and the published PNG renderer already support. Do not expand without player/editor work. */
export const BRAND_FONTS = ["inter", "noto-serif"] as const;
export type BrandFont = (typeof BRAND_FONTS)[number];

export const DISPLAY_NAME_MAX = 80;
export const PHONE_MAX = 32;
export const WEBSITE_MAX = 200;

export function isBrandFont(value: unknown): value is BrandFont {
  return value === "inter" || value === "noto-serif";
}

export type BrandIdentity = {
  displayName: string | null;
  textColor: string | null;
  backgroundColor: string | null;
  headingFont: BrandFont | null;
  bodyFont: BrandFont | null;
  phone: string | null;
  website: string | null;
};

export const EMPTY_IDENTITY: BrandIdentity = {
  displayName: null,
  textColor: null,
  backgroundColor: null,
  headingFont: null,
  bodyFont: null,
  phone: null,
  website: null,
};

/** Account brand as returned by GET /api/brand. Existing keys keep their names and types; identity keys are always present (null when unset). */
export type Brand = {
  primaryColor: string;
  accentColor: string;
  logoMediaId: string | null;
  available: boolean;
  custom: boolean;
} & BrandIdentity;

export type BrandFields = {
  primaryColor: string;
  accentColor: string;
  logoMediaId: string | null;
} & BrandIdentity;

/** Stored brand values used for a merge, without the GET flags. */
export type BrandRecord = {
  primaryColor: string;
  accentColor: string;
  logoMediaId: string | null;
} & BrandIdentity;

export const DEFAULT_BRAND_RECORD: BrandRecord = {
  primaryColor: "#0066ff",
  accentColor: "#ffd34d",
  logoMediaId: null,
  ...EMPTY_IDENTITY,
};

export const IDENTITY_KEYS = [
  "displayName",
  "textColor",
  "backgroundColor",
  "headingFont",
  "bodyFont",
  "phone",
  "website",
] as const;

export const BRAND_PUT_KEYS = [
  "primaryColor",
  "accentColor",
  "logoMediaId",
  ...IDENTITY_KEYS,
] as const;

export type BrandPutPatch = {
  [K in (typeof BRAND_PUT_KEYS)[number]]?: BrandRecord[K];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasOwn(body: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function cleanText(value: string): string {
  return value.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
}

export function parseDisplayName(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "Enter a display name." };
  const clean = cleanText(value);
  if (!clean) return { ok: true, value: null };
  if (clean.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Keep the display name under ${DISPLAY_NAME_MAX} characters.` };
  }
  return { ok: true, value: clean };
}

export function parsePhone(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "Enter a phone number." };
  const trimmed = value.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  if (!trimmed) return { ok: true, value: null };
  if (!/^[+\d][\d\s().\-+]*$/.test(trimmed)) return { ok: false, error: "Enter a phone number." };
  if (trimmed.length > PHONE_MAX) return { ok: false, error: `Keep the phone number under ${PHONE_MAX} characters.` };
  if ((trimmed.match(/\d/g) || []).length < 4) return { ok: false, error: "Enter a phone number." };
  return { ok: true, value: trimmed };
}

export function parseWebsite(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "Enter a website as http:// or https://." };
  const raw = value.trim();
  if (!raw) return { ok: true, value: null };
  if (raw.length > WEBSITE_MAX) return { ok: false, error: `Keep the website under ${WEBSITE_MAX} characters.` };
  if (/\s/.test(raw)) return { ok: false, error: "Enter a website as http:// or https://." };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Enter a website as http:// or https://." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Enter a website as http:// or https://." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Enter a website as http:// or https://." };
  }
  if (!url.hostname) return { ok: false, error: "Enter a website as http:// or https://." };
  // Lowercase only the scheme so HTTPS://… satisfies the database check ^https?://,
  // without rewriting the rest of the URL (URL.href would add a trailing slash).
  const normalized = raw.replace(/^(https?):\/\//i, (scheme) => scheme.toLowerCase());
  return { ok: true, value: normalized };
}

export function parseOptionalHex(value: unknown, label: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `Choose ${label} like #0066ff.` };
  if (!value.trim()) return { ok: true, value: null };
  const hex = normalizeHex(value);
  if (!hex) return { ok: false, error: `Choose ${label} like #0066ff.` };
  return { ok: true, value: hex };
}

export function parseOptionalFont(value: unknown, label: string): { ok: true; value: BrandFont | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `Choose Inter or Noto Serif for the ${label}.` };
  if (!value.trim()) return { ok: true, value: null };
  if (!isBrandFont(value)) return { ok: false, error: `Choose Inter or Noto Serif for the ${label}.` };
  return { ok: true, value };
}

function parseLogo(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || !UUID.test(value)) return { ok: false, error: "Choose a logo from your media." };
  return { ok: true, value: value.toLowerCase() };
}

function parseRequiredHex(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const hex = normalizeHex(value);
  if (!hex) return { ok: false, error: "Choose colours like #0066ff." };
  return { ok: true, value: hex };
}

/**
 * Parse a PUT /api/brand body into a sparse patch. A present key with null
 * (or a blank string for optional text) means "clear". An absent key is left
 * out of the patch so merge leaves the stored value alone. Android +13 always
 * sends {primaryColor, accentColor, logoMediaId} and never identity keys.
 */
export function parseBrandPut(body: unknown): { ok: true; patch: BrandPutPatch } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Send your brand as JSON." };
  }
  const raw = body as Record<string, unknown>;
  const patch: BrandPutPatch = {};

  if (hasOwn(raw, "primaryColor")) {
    const parsed = parseRequiredHex(raw.primaryColor);
    if (!parsed.ok) return parsed;
    patch.primaryColor = parsed.value;
  }
  if (hasOwn(raw, "accentColor")) {
    const parsed = parseRequiredHex(raw.accentColor);
    if (!parsed.ok) return parsed;
    patch.accentColor = parsed.value;
  }
  if (hasOwn(raw, "logoMediaId")) {
    const parsed = parseLogo(raw.logoMediaId);
    if (!parsed.ok) return parsed;
    patch.logoMediaId = parsed.value;
  }
  if (hasOwn(raw, "displayName")) {
    const parsed = parseDisplayName(raw.displayName);
    if (!parsed.ok) return parsed;
    patch.displayName = parsed.value;
  }
  if (hasOwn(raw, "textColor")) {
    const parsed = parseOptionalHex(raw.textColor, "a text colour");
    if (!parsed.ok) return parsed;
    patch.textColor = parsed.value;
  }
  if (hasOwn(raw, "backgroundColor")) {
    const parsed = parseOptionalHex(raw.backgroundColor, "a background colour");
    if (!parsed.ok) return parsed;
    patch.backgroundColor = parsed.value;
  }
  if (hasOwn(raw, "headingFont")) {
    const parsed = parseOptionalFont(raw.headingFont, "heading");
    if (!parsed.ok) return parsed;
    patch.headingFont = parsed.value;
  }
  if (hasOwn(raw, "bodyFont")) {
    const parsed = parseOptionalFont(raw.bodyFont, "body");
    if (!parsed.ok) return parsed;
    patch.bodyFont = parsed.value;
  }
  if (hasOwn(raw, "phone")) {
    const parsed = parsePhone(raw.phone);
    if (!parsed.ok) return parsed;
    patch.phone = parsed.value;
  }
  if (hasOwn(raw, "website")) {
    const parsed = parseWebsite(raw.website);
    if (!parsed.ok) return parsed;
    patch.website = parsed.value;
  }
  // Android +13 always sends {primaryColor, accentColor, logoMediaId} and never {}.
  // An empty body must not insert a default row.
  if (!BRAND_PUT_KEYS.some((key) => hasOwn(patch, key))) {
    return { ok: false, error: "Change at least one brand field." };
  }
  return { ok: true, patch };
}

/** Snake_case columns for a sparse PUT patch. Only provided keys are present, so an UPDATE cannot overwrite omitted fields. */
export const BRAND_COLUMNS: Record<(typeof BRAND_PUT_KEYS)[number], string> = {
  primaryColor: "primary_color",
  accentColor: "accent_color",
  logoMediaId: "logo_media_id",
  displayName: "display_name",
  textColor: "text_color",
  backgroundColor: "background_color",
  headingFont: "heading_font",
  bodyFont: "body_font",
  phone: "phone",
  website: "website",
};

/**
 * Build a column-only write payload from a sparse PUT patch. Absent keys are
 * omitted (not nulled). A present null is included so that field is cleared.
 */
export function brandPatchRow(patch: BrandPutPatch, opts?: { includeIdentity?: boolean }): Record<string, unknown> {
  const includeIdentity = opts?.includeIdentity !== false;
  const row: Record<string, unknown> = {};
  for (const key of BRAND_PUT_KEYS) {
    if (!hasOwn(patch, key)) continue;
    if (!includeIdentity && (IDENTITY_KEYS as readonly string[]).includes(key)) continue;
    row[BRAND_COLUMNS[key]] = patch[key] ?? null;
  }
  return row;
}

export function isEmptyBrandPatch(patch: BrandPutPatch): boolean {
  return !BRAND_PUT_KEYS.some((key) => hasOwn(patch, key));
}

/** Merge a sparse PUT patch onto the stored record. Absent keys stay as they are. */
export function mergeBrandRecord(existing: BrandRecord | null, patch: BrandPutPatch): BrandRecord {
  const next: BrandRecord = { ...(existing ?? DEFAULT_BRAND_RECORD) };
  for (const key of BRAND_PUT_KEYS) {
    if (hasOwn(patch, key)) {
      (next as Record<string, unknown>)[key] = patch[key] as unknown;
    }
  }
  return next;
}

export function patchTouchesIdentity(patch: BrandPutPatch): boolean {
  return IDENTITY_KEYS.some((key) => hasOwn(patch, key));
}

/** True when the patch would write a non-null identity value. Clearing (null) or omitting is not a write. Used so a preview against a pre-0025 database can still save colours. */
export function patchWritesIdentity(patch: BrandPutPatch): boolean {
  return IDENTITY_KEYS.some((key) => hasOwn(patch, key) && patch[key] != null);
}

export function brandFromRow(
  row: {
    primary_color?: unknown;
    accent_color?: unknown;
    logo_media_id?: unknown;
    display_name?: unknown;
    text_color?: unknown;
    background_color?: unknown;
    heading_font?: unknown;
    body_font?: unknown;
    phone?: unknown;
    website?: unknown;
  } | null | undefined,
  opts: { available: boolean; custom: boolean; primaryColor?: string; accentColor?: string },
): Brand {
  const primary = typeof row?.primary_color === "string" ? row.primary_color : (opts.primaryColor ?? DEFAULT_BRAND_RECORD.primaryColor);
  const accent = typeof row?.accent_color === "string" ? row.accent_color : (opts.accentColor ?? DEFAULT_BRAND_RECORD.accentColor);
  return {
    primaryColor: primary,
    accentColor: accent,
    logoMediaId: row?.logo_media_id ? String(row.logo_media_id) : null,
    displayName: optionalString(row?.display_name),
    textColor: optionalString(row?.text_color),
    backgroundColor: optionalString(row?.background_color),
    headingFont: isBrandFont(row?.heading_font) ? row.heading_font : null,
    bodyFont: isBrandFont(row?.body_font) ? row.body_font : null,
    phone: optionalString(row?.phone),
    website: optionalString(row?.website),
    available: opts.available,
    custom: opts.custom,
  };
}

export function brandFromRecord(record: BrandRecord, opts: { available: boolean; custom: boolean }): Brand {
  return { ...record, available: opts.available, custom: opts.custom };
}

export function defaultBrandResponse(available: boolean): Brand {
  return { ...DEFAULT_BRAND_RECORD, available, custom: false };
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean || null;
}

function identityFrom(loaded: Partial<BrandIdentity> | null | undefined): BrandIdentity {
  return {
    displayName: loaded?.displayName ?? null,
    textColor: loaded?.textColor ?? null,
    backgroundColor: loaded?.backgroundColor ?? null,
    headingFont: isBrandFont(loaded?.headingFont) ? loaded.headingFont : null,
    bodyFont: isBrandFont(loaded?.bodyFont) ? loaded.bodyFont : null,
    phone: loaded?.phone ?? null,
    website: loaded?.website ?? null,
  };
}

/** Copy loaded brand values into the form. Never substitutes built-in defaults. */
export function prefillBrandForm(loaded: Partial<BrandFields> & Pick<BrandFields, "primaryColor" | "accentColor" | "logoMediaId">): BrandFields {
  return {
    primaryColor: loaded.primaryColor,
    accentColor: loaded.accentColor,
    logoMediaId: loaded.logoMediaId,
    ...identityFrom(loaded),
  };
}

/**
 * Build the PUT /api/brand body from the values already on the account and the
 * user's form. Empty or invalid colour fields keep the loaded values, so a first
 * save never overwrites an existing brand with blanks or built-in defaults.
 * A cleared logo (null) is sent only after the form was prefilled from loaded
 * values — the caller must not save before prefill. Identity fields on the form
 * are sent in full so a web Save writes every section; empty optional fields
 * clear. Validation matches the server allowlists.
 */
export function brandSavePayload(
  loaded: Partial<BrandFields> & Pick<BrandFields, "primaryColor" | "accentColor" | "logoMediaId">,
  form: Partial<BrandFields> & Pick<BrandFields, "primaryColor" | "accentColor" | "logoMediaId">,
): { ok: true; body: BrandFields } | { ok: false; error: string } {
  const primaryColor = normalizeHex(form.primaryColor) ?? normalizeHex(loaded.primaryColor);
  const accentColor = normalizeHex(form.accentColor) ?? normalizeHex(loaded.accentColor);
  if (!primaryColor || !accentColor) {
    return { ok: false, error: "Choose colours like #0066ff." };
  }
  const identitySource: Partial<BrandIdentity> = {
    displayName: "displayName" in form ? form.displayName : loaded.displayName,
    textColor: "textColor" in form ? form.textColor : loaded.textColor,
    backgroundColor: "backgroundColor" in form ? form.backgroundColor : loaded.backgroundColor,
    headingFont: "headingFont" in form ? form.headingFont : loaded.headingFont,
    bodyFont: "bodyFont" in form ? form.bodyFont : loaded.bodyFont,
    phone: "phone" in form ? form.phone : loaded.phone,
    website: "website" in form ? form.website : loaded.website,
  };
  const displayName = parseDisplayName(identitySource.displayName ?? null);
  if (!displayName.ok) return displayName;
  const textColor = parseOptionalHex(identitySource.textColor ?? null, "a text colour");
  if (!textColor.ok) return textColor;
  const backgroundColor = parseOptionalHex(identitySource.backgroundColor ?? null, "a background colour");
  if (!backgroundColor.ok) return backgroundColor;
  const headingFont = parseOptionalFont(identitySource.headingFont ?? null, "heading");
  if (!headingFont.ok) return headingFont;
  const bodyFont = parseOptionalFont(identitySource.bodyFont ?? null, "body");
  if (!bodyFont.ok) return bodyFont;
  const phone = parsePhone(identitySource.phone ?? null);
  if (!phone.ok) return phone;
  const website = parseWebsite(identitySource.website ?? null);
  if (!website.ok) return website;
  return {
    ok: true,
    body: {
      primaryColor,
      accentColor,
      logoMediaId: form.logoMediaId,
      displayName: displayName.value,
      textColor: textColor.value,
      backgroundColor: backgroundColor.value,
      headingFont: headingFont.value,
      bodyFont: bodyFont.value,
      phone: phone.value,
      website: website.value,
    },
  };
}

/** True when the form still matches the loaded brand, so Save would write the same values. */
export function brandFormUnchanged(
  loaded: Partial<BrandFields> & Pick<BrandFields, "primaryColor" | "accentColor" | "logoMediaId">,
  form: Partial<BrandFields> & Pick<BrandFields, "primaryColor" | "accentColor" | "logoMediaId">,
): boolean {
  const payload = brandSavePayload(loaded, form);
  if (!payload.ok) return false;
  const current = prefillBrandForm(loaded);
  const body = payload.body;
  return (
    body.primaryColor === (normalizeHex(current.primaryColor) ?? current.primaryColor) &&
    body.accentColor === (normalizeHex(current.accentColor) ?? current.accentColor) &&
    body.logoMediaId === current.logoMediaId &&
    body.displayName === current.displayName &&
    body.textColor === (current.textColor ? normalizeHex(current.textColor) ?? current.textColor : null) &&
    body.backgroundColor === (current.backgroundColor ? normalizeHex(current.backgroundColor) ?? current.backgroundColor : null) &&
    body.headingFont === current.headingFont &&
    body.bodyFont === current.bodyFont &&
    body.phone === current.phone &&
    body.website === current.website
  );
}

export function fontFamilyName(font: BrandFont | null | undefined): string {
  return font === "noto-serif" ? "Noto Serif" : "Inter";
}


/** Seed a fresh classic menu with display name and contact, only in slots the template already has. */
export function seedClassicMenu(content: MenuContent, kit: Partial<BrandIdentity> | null | undefined): MenuContent {
  const title = clipBrandText(kit?.displayName, MENU_LIMITS.title);
  const footer = clipBrandText(classicFooter(kit), MENU_LIMITS.footer);
  if (!title && !footer) return content;
  const nextTitle = title ?? content.title;
  const nextFooter = footer ?? content.footer;
  if (nextTitle === content.title && nextFooter === content.footer) return content;
  return {
    ...content,
    ...(title ? { title } : {}),
    ...(footer ? { footer } : {}),
  };
}

export type ClassicSeedDraft = {
  id: string | null;
  name: string;
  template: MenuTemplate;
  content: MenuContent;
  displayIds: string[];
};

export type ClassicSeedBaseline = {
  name: string;
  template: MenuTemplate;
  content: MenuContent;
  displayIds: string[];
};

/**
 * Seed a new, still-clean classic draft and return a baseline that matches, so
 * Back and the leave guard do not prompt. Returns null when the draft already
 * has an id, is dirty relative to the current baseline, or the kit has nothing
 * to apply. Used inside ClassicEditor the way Layout Studio uses markClean.
 */
export function seedFreshClassicIfClean<T extends ClassicSeedDraft>(
  draft: T,
  kit: Partial<BrandIdentity> | null | undefined,
  baseline: ClassicSeedBaseline,
): { draft: T; baseline: ClassicSeedBaseline } | null {
  if (draft.id) return null;
  if (!kit) return null;
  const current = { name: draft.name, template: draft.template, content: draft.content, displayIds: draft.displayIds };
  if (JSON.stringify(current) !== JSON.stringify(baseline)) return null;
  const content = seedClassicMenu(draft.content, kit);
  if (content === draft.content) return null;
  const next = { ...draft, content };
  return {
    draft: next,
    baseline: { name: next.name, template: next.template, content, displayIds: next.displayIds },
  };
}

export function clipBrandText(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const clean = cleanText(value);
  if (!clean) return null;
  return clean.length > max ? clean.slice(0, max).trimEnd() : clean;
}

function classicFooter(kit: Partial<BrandIdentity> | null | undefined): string | null {
  if (!kit) return null;
  const parts = [kit.phone, kit.website].map((p) => (p ? cleanText(p) : "")).filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
