"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi, type MediaItem } from "@/lib/api";
import { useToast } from "@/components/toast";
import { IconGear } from "@/components/icons";
import { LoadState, PageHeader } from "@/components/ui";
import { DEFAULT_BRAND, normalizeHex } from "@/lib/menu-templates";
import { artImages } from "@/lib/brand-kit";
import {
  brandSavePayload,
  prefillBrandForm,
  type Brand,
  type BrandFields,
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
  const [busy, setBusy] = useState<"save" | "apply" | null>(null);
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
      toast.show("Brand saved. New menus use it. Choose “Apply to all menus and promos” to update the ones you have.");
    } catch (err) {
      toast.show((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  async function applyAll() {
    if (fixture) return;
    setBusy("apply");
    try {
      let updated = 0, failed = 0;
      for (const kind of ["menus", "promos"] as const) {
        let after: string | null = null;
        do {
          const res: { updated: number; failed: number; next: string | null } = await api("/api/brand/apply", { method: "POST", body: JSON.stringify({ kind, ...(after ? { after } : {}) }) });
          updated += res.updated; failed += res.failed; after = res.next;
        } while (after);
      }
      toast.show(failed ? `Updated ${updated} slides. ${failed} couldn't be updated; try again.` : `Updated ${updated} slide${updated === 1 ? "" : "s"}. Screens refresh within a minute.`, failed > 0);
    } catch (err) {
      toast.show((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="min-w-0">
      <PageHeader
        title="Brand Kit"
        eyebrow="Account"
        icon={<IconGear />}
        lede="Your logo, main colour, and highlight colour. Menus and promotions that use your brand read these same values."
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
          onApply={() => void applyAll()}
        />
      )}
    </section>
  );
}

function BrandEditor({
  form, setForm, images, custom, busy, onSave, onApply,
}: {
  form: BrandFields;
  setForm: (next: BrandFields) => void;
  images: MediaItem[];
  custom: boolean;
  busy: "save" | "apply" | null;
  onSave: () => void;
  onApply: () => void;
}) {
  const valid = Boolean(normalizeHex(form.primaryColor) && normalizeHex(form.accentColor));
  const colour = (key: "primaryColor" | "accentColor", label: string) => (
    <label className="grid gap-1">
      <span className="form-label">{label}</span>
      <span className="flex gap-2 items-center">
        <input
          type="color"
          aria-label={`${label} picker`}
          className="h-10 w-12 rounded border border-line"
          value={normalizeHex(form[key]) ?? DEFAULT_BRAND[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
        <input
          className="field w-32"
          aria-label={label}
          value={form[key]}
          maxLength={7}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      </span>
    </label>
  );
  const logo = images.find((item) => item.id === form.logoMediaId);

  return (
    <section className="card p-4 md:p-6" aria-labelledby="brand-heading" id="brand">
      <h2 id="brand-heading" className="text-lg font-semibold">Your brand</h2>
      <p className="text-sm text-muted">These go on every menu board and promo that has “Use my brand” ticked. Saving does not change slides you already have until you apply them.</p>
      {logo?.url || logo?.thumbnailUrl ? (
        <div className="mt-4 flex items-center gap-3">
          <img src={logo.url ?? logo.thumbnailUrl ?? ""} alt="" className="size-14 rounded-lg object-contain border border-line bg-paper" />
          <p className="text-sm font-medium truncate">{logo.fileName}</p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-4 items-end">
        <label className="grid gap-1">
          <span className="form-label">Logo</span>
          <select className="field min-w-56" value={form.logoMediaId ?? ""} onChange={(e) => setForm({ ...form, logoMediaId: e.target.value || null })}>
            <option value="">No logo</option>
            {images.map((m) => (
              <option key={m.id} value={m.id}>{m.fileName}</option>
            ))}
          </select>
        </label>
        {colour("primaryColor", "Main colour")}
        {colour("accentColor", "Highlight colour")}
      </div>
      {!images.length ? <p className="text-xs text-muted mt-2">To add a logo, upload it as a JPG or PNG in Media first.</p> : null}
      {!valid ? <p className="text-sm text-danger mt-2" role="alert">Use colours like #0066ff.</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={!valid || busy !== null} onClick={onSave}>{busy === "save" ? "Saving…" : "Save brand"}</button>
        <button type="button" className="btn btn-quiet" disabled={!custom || busy !== null} onClick={onApply}>{busy === "apply" ? "Updating…" : "Apply to all menus and promos"}</button>
      </div>
    </section>
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
              ? [logo?.fileName, main, highlight].filter(Boolean).join(" · ")
              : "Using built-in colours. Set your logo and colours in Brand Kit."}
          </p>
        </div>
      </div>
      <Link href="/dashboard/account/brand-kit" className="btn btn-quiet shrink-0">Edit in Brand Kit</Link>
    </section>
  );
}
