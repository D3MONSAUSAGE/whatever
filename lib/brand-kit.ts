import { normalizeHex } from "@/lib/menu-templates";
import type { MediaItem } from "@/lib/api";

/** JPG or PNG images that can go on a menu (logos and photos). Menu slides themselves are left out. */
export function artImages(media: MediaItem[] | null | undefined) {
  return (media ?? []).filter((m) => m.kind !== "video" && /\.(png|jpe?g)$/i.test(m.fileName) && !/\((menu|promo)\)\.png$/.test(m.fileName));
}


/** Account brand as returned by GET /api/brand. Matches the existing API shape. */
export type Brand = {
  primaryColor: string;
  accentColor: string;
  logoMediaId: string | null;
  available: boolean;
  custom: boolean;
};

export type BrandFields = {
  primaryColor: string;
  accentColor: string;
  logoMediaId: string | null;
};

/** Copy loaded brand values into the form. Never substitutes built-in defaults. */
export function prefillBrandForm(loaded: BrandFields): BrandFields {
  return {
    primaryColor: loaded.primaryColor,
    accentColor: loaded.accentColor,
    logoMediaId: loaded.logoMediaId,
  };
}

/**
 * Build the PUT /api/brand body from the values already on the account and the
 * user's form. Empty or invalid colour fields keep the loaded values, so a first
 * save never overwrites an existing brand with blanks or built-in defaults.
 * A cleared logo (null) is sent only after the form was prefilled from loaded
 * values — the caller must not save before prefill.
 */
export function brandSavePayload(
  loaded: BrandFields,
  form: BrandFields,
): { ok: true; body: BrandFields } | { ok: false; error: string } {
  const primaryColor = normalizeHex(form.primaryColor) ?? normalizeHex(loaded.primaryColor);
  const accentColor = normalizeHex(form.accentColor) ?? normalizeHex(loaded.accentColor);
  if (!primaryColor || !accentColor) {
    return { ok: false, error: "Choose colours like #0066ff." };
  }
  return {
    ok: true,
    body: {
      primaryColor,
      accentColor,
      logoMediaId: form.logoMediaId,
    },
  };
}

/** True when the form still matches the loaded brand, so Save would write the same values. */
export function brandFormUnchanged(loaded: BrandFields, form: BrandFields): boolean {
  const payload = brandSavePayload(loaded, form);
  if (!payload.ok) return false;
  return (
    payload.body.primaryColor === normalizeHex(loaded.primaryColor) &&
    payload.body.accentColor === normalizeHex(loaded.accentColor) &&
    payload.body.logoMediaId === loaded.logoMediaId
  );
}
