"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi, type MediaItem } from "@/lib/api";
import { useToast } from "@/components/toast";
import { IconGear } from "@/components/icons";
import { LoadState, PageHeader } from "@/components/ui";
import { DEFAULT_BRAND, normalizeHex } from "@/lib/menu-templates";
import {
  artImages,
  brandSavePayload,
  DISPLAY_NAME_MAX,
  fontFamilyName,
  PHONE_MAX,
  prefillBrandForm,
  WEBSITE_MAX,
  type Brand,
  type BrandFields,
  type BrandFont,
} from "@/lib/brand-kit";

export type { Brand } from "@/lib/brand-kit";

export type BrandKitFixture = {
  brand: Brand;
  images: MediaItem[];
};

export function BrandKit({ fixture }: { fixture?: BrandKitFixture }) {
  const liveBrand = useApi<Brand>(fixture ? null : "/api/brand");
  const liveMedia = useApi<MediaItem[]>(fixture ? null : "/api/media");
  const brand = fixture?.brand ?? liveBrand.data;
  const error = fixture ? null : liveBrand.error;
  const images = artImages(fixture?.images ?? liveMedia.data);
  const [form, setForm] = useState<BrandFields | null>(null);
  const [busy, setBusy] = useState<"save" | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (brand && !form) setForm(prefillBrandForm(brand));
  }, [brand, form]);

  async function save() {
    if (!brand || !form || fixture) return;
    const payload = brandSavePayload(brand, form);
    if (!payload.ok) {
      toast.show(payload.error, true);
      return;
    }
    setBusy("save");
    try {
      await api("/api/brand", { method: "PUT", body: JSON.stringify(payload.body) });
      await liveBrand.reload();
      setForm(prefillBrandForm(payload.body));
      toast.show("Brand saved. New menus and boards can use it. Existing boards are left unchanged.");
    } catch (err) {
      toast.show((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="min-w-0 pb-28 lg:pb-0">
      <PageHeader
        title="Brand Kit"
        eyebrow="Account"
        icon={<IconGear />}
        lede="Your business details, logo, colours, and fonts. New menus and boards can use these same values. Saving does not change boards you already have."
      />
      {!brand ? (
        <LoadState error={error} label="Loading your brand…" />
      ) : !brand.available ? (
        <p className="text-muted" role="status">Branding isn't available yet. Try again after the next update.</p>
      ) : !form ? (
        <LoadState label="Loading your brand…" />
      ) : (
        <BrandEditor
          form={form}
          setForm={setForm}
          images={images}
          custom={brand.custom}
          busy={busy}
          onSave={() => void save()}
        />
      )}
    </section>
  );
}

const FONT_OPTIONS: { id: BrandFont; label: string }[] = [
  { id: "inter", label: "Inter" },
  { id: "noto-serif", label: "Noto Serif" },
];

function BrandEditor({
  form, setForm, images, custom, busy, onSave,
}: {
  form: BrandFields;
  setForm: (next: BrandFields) => void;
  images: MediaItem[];
  custom: boolean;
  busy: "save" | null;
  onSave: () => void;
}) {
  const valid = Boolean(normalizeHex(form.primaryColor) && normalizeHex(form.accentColor));
  const colour = (key: "primaryColor" | "accentColor" | "textColor" | "backgroundColor", label: string, optional = false) => {
    const fallback = key === "textColor" ? "#1a1a1a" : key === "backgroundColor" ? "#f7f3ea" : DEFAULT_BRAND[key === "accentColor" ? "accentColor" : "primaryColor"];
    const raw = form[key] ?? "";
    return (
      <label className="grid gap-1">
        <span className="form-label">{label}</span>
        <span className="flex gap-2 items-center">
          <input
            type="color"
            aria-label={`${label} picker`}
            className="h-10 w-12 rounded border border-line"
            value={normalizeHex(raw) ?? fallback}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          />
          <input
            className="field w-32"
            aria-label={label}
            value={raw}
            maxLength={7}
            placeholder={optional ? "Default" : undefined}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          />
          {optional && raw ? (
            <button type="button" className="btn btn-quiet text-sm" onClick={() => setForm({ ...form, [key]: null })}>
              Clear
            </button>
          ) : null}
        </span>
      </label>
    );
  };
  const logo = images.find((item) => item.id === form.logoMediaId);
  const primary = normalizeHex(form.primaryColor) ?? DEFAULT_BRAND.primaryColor;
  const accent = normalizeHex(form.accentColor) ?? DEFAULT_BRAND.accentColor;
  const textColor = normalizeHex(form.textColor) ?? "#1a1a1a";
  const backgroundColor = normalizeHex(form.backgroundColor) ?? "#f7f3ea";
  const headingFamily = fontFamilyName(form.headingFont);
  const bodyFamily = fontFamilyName(form.bodyFont);
  const logoSrc = logo?.url ?? logo?.thumbnailUrl ?? "";
  const title = form.displayName?.trim() || "Your menu";
  const footerParts = [form.phone?.trim(), form.website?.trim()].filter(Boolean);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,24rem)] items-start">
      <style>{`
        @font-face { font-family: Inter; src: url("/layout-studio/media/font/inter") format("truetype"); font-weight: 400; font-style: normal; }
        @font-face { font-family: Inter; src: url("/layout-studio/media/font/inter-bold") format("truetype"); font-weight: 700; font-style: normal; }
        @font-face { font-family: "Noto Serif"; src: url("/layout-studio/media/font/noto-serif") format("truetype"); font-weight: 400; font-style: normal; }
        @font-face { font-family: "Noto Serif"; src: url("/layout-studio/media/font/noto-serif-bold") format("truetype"); font-weight: 700; font-style: normal; }
      `}</style>
      <section className="card flex flex-col gap-6 p-5 md:p-6" aria-labelledby="brand-heading" id="brand">
        <div>
          <h2 id="brand-heading" className="text-lg font-semibold">Your brand</h2>
          <p className="text-sm text-muted mt-1">
            {custom
              ? "These go on new menu boards and promos that use your brand. Saving does not change boards you already have."
              : "Using built-in colours. Set your business details, logo, colours, and fonts, then save. New menus can use them; existing boards stay as they are."}
          </p>
        </div>

        <div className="grid gap-3">
          <h3 className="text-sm font-semibold">Business</h3>
          <label className="grid gap-1">
            <span className="form-label">Display name</span>
            <input
              className="field"
              aria-label="Display name"
              value={form.displayName ?? ""}
              maxLength={DISPLAY_NAME_MAX}
              autoComplete="organization"
              placeholder="Your business"
              onChange={(e) => setForm({ ...form, displayName: e.target.value || null })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="form-label">Phone</span>
              <input
                className="field"
                aria-label="Phone"
                type="tel"
                value={form.phone ?? ""}
                maxLength={PHONE_MAX}
                autoComplete="tel"
                placeholder="(415) 555-0100"
                onChange={(e) => setForm({ ...form, phone: e.target.value || null })}
              />
            </label>
            <label className="grid gap-1">
              <span className="form-label">Website</span>
              <input
                className="field"
                aria-label="Website"
                type="url"
                value={form.website ?? ""}
                maxLength={WEBSITE_MAX}
                autoComplete="url"
                placeholder="https://"
                onChange={(e) => setForm({ ...form, website: e.target.value || null })}
              />
            </label>
          </div>
        </div>

        <div className="grid gap-3">
          <h3 className="text-sm font-semibold">Logo</h3>
          {logoSrc ? (
            <div className="flex items-center gap-3">
              <img src={logoSrc} alt="" className="size-14 rounded-lg object-contain border border-line bg-paper" />
              <p className="text-sm font-medium truncate">{logo?.fileName}</p>
            </div>
          ) : null}
          <label className="grid gap-1">
            <span className="form-label">Logo</span>
            <select className="field min-w-56" value={form.logoMediaId ?? ""} onChange={(e) => setForm({ ...form, logoMediaId: e.target.value || null })}>
              <option value="">No logo</option>
              {images.map((m) => (
                <option key={m.id} value={m.id}>{m.fileName}</option>
              ))}
            </select>
          </label>
          {!images.length ? <p className="text-xs text-muted">To add a logo, upload it as a JPG or PNG in Media first.</p> : null}
        </div>

        <div className="grid gap-3">
          <h3 className="text-sm font-semibold">Colours</h3>
          <div className="flex flex-wrap gap-4 items-end">
            {colour("primaryColor", "Main colour")}
            {colour("accentColor", "Highlight colour")}
            {colour("textColor", "Text colour", true)}
            {colour("backgroundColor", "Background colour", true)}
          </div>
          {!valid ? <p className="text-sm text-danger" role="alert">Use colours like #0066ff.</p> : null}
        </div>

        <div className="grid gap-3">
          <h3 className="text-sm font-semibold">Fonts</h3>
          <p className="text-xs text-muted">Inter and Noto Serif, the same faces already drawn into published boards.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="form-label">Heading</span>
              <select
                className="field"
                aria-label="Heading font"
                value={form.headingFont ?? ""}
                onChange={(e) => setForm({ ...form, headingFont: (e.target.value || null) as BrandFont | null })}
              >
                <option value="">Default</option>
                {FONT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="form-label">Body</span>
              <select
                className="field"
                aria-label="Body font"
                value={form.bodyFont ?? ""}
                onChange={(e) => setForm({ ...form, bodyFont: (e.target.value || null) as BrandFont | null })}
              >
                <option value="">Default</option>
                {FONT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

      </section>

      <aside className="card p-5 md:p-6" aria-label="Brand preview">
        <h2 className="text-lg font-semibold">Preview</h2>
        <p className="text-sm text-muted mt-1 mb-4">A live look at your brand. This is not a published board.</p>
        <div
          className="overflow-hidden rounded-xl border border-line shadow-sm flex flex-col"
          style={{ aspectRatio: "16 / 9", background: backgroundColor, color: textColor }}
        >
          <div
            className="flex items-center gap-3 px-4 shrink-0"
            style={{ height: "32%", background: primary, color: "#fff" }}
          >
            {logoSrc ? (
              <img src={logoSrc} alt="" className="h-10 w-10 rounded-md object-contain bg-white/15" />
            ) : (
              <span className="h-10 w-10 rounded-md border border-white/40" aria-hidden="true" />
            )}
            <span className="font-semibold truncate" style={{ fontSize: 18, letterSpacing: "-0.02em", fontFamily: headingFamily }}>{title}</span>
          </div>
          <div className="grid gap-3 px-4 py-3 flex-1 min-h-0" style={{ fontFamily: bodyFamily, color: textColor }}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">Featured item</span>
              <span
                className="rounded-full px-2.5 py-0.5 text-sm font-semibold"
                style={{ background: accent, color: "#1a1a1a", fontFamily: headingFamily }}
              >
                $12
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>House special</span>
              <span
                className="rounded-full px-2.5 py-0.5 text-sm font-semibold"
                style={{ background: accent, color: "#1a1a1a", fontFamily: headingFamily }}
              >
                $9
              </span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: primary, width: "40%", opacity: 0.85 }} />
          </div>
          {footerParts.length ? (
            <p className="px-4 pb-3 text-xs truncate shrink-0" style={{ fontFamily: bodyFamily, color: textColor, opacity: 0.85 }}>
              {footerParts.join(" · ")}
            </p>
          ) : null}
        </div>
      </aside>

        <div className="lg:col-start-1">
          <button type="button" className="btn btn-primary min-h-11" disabled={!valid || busy !== null} onClick={onSave}>{busy === "save" ? "Saving…" : "Save brand"}</button>
        </div>
    </div>
  );
}

/** Compact read-only brand strip for Menus and Promotions, with a link to edit. */
export function BrandSummary({
  fixture,
  id = "brand",
}: {
  fixture?: BrandKitFixture;
  id?: string;
}) {
  const liveBrand = useApi<Brand>(fixture ? null : "/api/brand");
  const liveMedia = useApi<MediaItem[]>(fixture ? null : "/api/media");
  const brand = fixture?.brand ?? liveBrand.data;
  const images = artImages(fixture?.images ?? liveMedia.data);
  if (liveBrand.error && !fixture) return <p className="text-danger mb-4" role="alert">{liveBrand.error}</p>;
  if (!brand || !brand.available) return null;
  const logo = images.find((item) => item.id === brand.logoMediaId);
  const main = normalizeHex(brand.primaryColor) ?? brand.primaryColor;
  const highlight = normalizeHex(brand.accentColor) ?? brand.accentColor;
  const name = brand.displayName?.trim();

  return (
    <section className="card p-4 mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="brand-summary-heading" id={id}>
      <div className="min-w-0 flex items-center gap-3">
        <span className="flex items-center gap-1.5 shrink-0" aria-hidden="true">
          {logo?.url || logo?.thumbnailUrl ? (
            <img src={logo.url ?? logo.thumbnailUrl ?? ""} alt="" className="size-10 rounded-lg object-contain border border-line bg-paper" />
          ) : (
            <span className="size-10 rounded-lg border border-dashed border-line bg-paper" />
          )}
          <span className="size-7 rounded-full border border-line" style={{ background: main }} />
          <span className="size-7 rounded-full border border-line" style={{ background: highlight }} />
        </span>
        <div className="min-w-0">
          <h2 id="brand-summary-heading" className="font-semibold">Your brand</h2>
          <p className="text-sm text-muted truncate">
            {brand.custom
              ? [name, logo?.fileName, main, highlight].filter(Boolean).join(" · ")
              : "Using built-in colours. Set your logo and colours in Brand Kit."}
          </p>
        </div>
      </div>
      <Link href="/dashboard/account/brand-kit" className="btn btn-quiet shrink-0">Edit in Brand Kit</Link>
    </section>
  );
}
