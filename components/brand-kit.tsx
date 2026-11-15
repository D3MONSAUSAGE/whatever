"use client";
import { useLocale, useT } from "@/lib/i18n/client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi, type MediaItem } from "@/lib/api";
import { DirectImageUpload } from "@/components/direct-image-upload";
import { BOARD_FONTS, fontFaceCss } from "@/lib/board-fonts";
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
  displayNameSuggestion,
  parsePhone,
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
  const t = useT();
  const liveBrand = useApi<Brand>(fixture ? null : "/api/brand");
  const liveMedia = useApi<MediaItem[]>(fixture ? null : "/api/media");
  const brand = fixture?.brand ?? liveBrand.data;
  const error = fixture ? null : liveBrand.error;
  const images = artImages(fixture?.images ?? liveMedia.data);
  const [form, setForm] = useState<BrandFields | null>(null);
  const [busy, setBusy] = useState<"save" | null>(null);
  // QA r7: a save result must stay visible, not only in a toast that can be replaced or missed.
  const [saveResult, setSaveResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [nameFromBusiness, setNameFromBusiness] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const me = useApi<{ accountName: string }>(fixture ? null : "/api/me");
  const toast = useToast();

  useEffect(() => {
    if (brand && !form) setForm(prefillBrandForm(brand));
  }, [brand, form]);

  // Suggest the business name as the display name, only when it is empty (QA U1-06a).
  // It is a suggestion in the form; nothing is saved until the owner presses Save.
  const businessName = me.data?.accountName?.trim() ?? "";
  useEffect(() => {
    if (!form || nameFromBusiness) return;
    const next = displayNameSuggestion(form.displayName, businessName);
    if (next) {
      setForm({ ...form, displayName: next });
      setNameFromBusiness(true);
    }
  }, [form, businessName, nameFromBusiness]);

  const { locale } = useLocale();

  async function save() {
    if (!brand || !form || fixture) return;
    const payload = brandSavePayload(brand, form);
    if (!payload.ok) {
      toast.show(payload.error, true);
      setSaveResult({ ok: false, text: payload.error });
      return;
    }
    setBusy("save");
    setSaveResult(null);
    try {
      await api("/api/brand", { method: "PUT", body: JSON.stringify(payload.body) });
      await liveBrand.reload();
      setForm(prefillBrandForm(payload.body));
      setSavedOnce(true);
      toast.show(t("bk.saved"));
      setSaveResult({ ok: true, text: t("bk.savedAt", { time: new Date().toLocaleTimeString(locale === "es" ? "es" : [], { hour: "numeric", minute: "2-digit" }) }) });
    } catch (err) {
      const message = (err as Error)?.message || t("bk.saveFailed");
      toast.show(message, true);
      setSaveResult({ ok: false, text: message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="min-w-0 pb-28 lg:pb-0">
      <PageHeader
        title={t("bk.title")}
        eyebrow={t("bk.eyebrow")}
        icon={<IconGear />}
        lede={t("bk.lede")}
      />
      {!brand ? (
        <LoadState error={error} label={t("bk.loading")} />
      ) : !brand.available ? (
        <p className="text-muted" role="status">{t("bk.unavailable")}</p>
      ) : !form ? (
        <LoadState label={t("bk.loading")} />
      ) : (
        <BrandEditor
          nameFromBusiness={nameFromBusiness && !savedOnce}
          form={form}
          setForm={(next) => { setSaveResult(null); setForm(next); }}
          images={images}
          custom={brand.custom}
          busy={busy}
          saveResult={saveResult}
          onSave={() => void save()}
          onLogoUploaded={fixture ? undefined : async (id) => {
            await liveMedia.reload();
            setForm((current) => (current ? { ...current, logoMediaId: id } : current));
            setSaveResult(null);
          }}
        />
      )}
    </section>
  );
}

// E6-F4: each option is drawn in its own face where the browser supports styled options (Chrome desktop).
const FONT_OPTIONS: { id: BrandFont; label: string; family: string }[] = BOARD_FONTS.map((font) => ({ id: font.id, label: font.label, family: font.family }));

function BrandEditor({
  form, setForm, images, custom, busy, onSave, nameFromBusiness = false, onLogoUploaded, saveResult = null,
}: {
  saveResult?: { ok: boolean; text: string } | null;
  /** Reload media and select the new logo after a direct upload (E3). Absent in fixtures. */
  onLogoUploaded?: (id: string) => Promise<void>;
  nameFromBusiness?: boolean;
  form: BrandFields;
  setForm: (next: BrandFields) => void;
  images: MediaItem[];
  custom: boolean;
  busy: "save" | null;
  onSave: () => void;
}) {
  const t = useT();
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
            aria-label={t("bk.pickerFor", { label })}
            className="h-10 w-12 rounded border border-line"
            value={normalizeHex(raw) ?? fallback}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          />
          <input
            className="field w-32"
            aria-label={label}
            value={raw}
            maxLength={7}
            placeholder={optional ? t("bk.colorDefault") : undefined}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          />
          {optional && raw ? (
            <button type="button" className="btn btn-quiet text-sm" onClick={() => setForm({ ...form, [key]: null })}>
              {t("bk.clear")}
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
  const title = form.displayName?.trim() || t("bk.previewTitle");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const phoneCheck = parsePhone(form.phone ?? "");
  const phoneError = phoneCheck.ok || !phoneTouched ? null : phoneCheck.error;
  const footerParts = [form.phone?.trim(), form.website?.trim()].filter(Boolean);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,24rem)] items-start">
      <style>{`
        ${fontFaceCss()}
      `}</style>
      <section className="card flex flex-col gap-6 p-5 md:p-6" aria-labelledby="brand-heading" id="brand">
        <div>
          <h2 id="brand-heading" className="text-lg font-semibold">{t("bk.yourBrand")}</h2>
          <p className="text-sm text-muted mt-1">
            {custom
              ? t("bk.customNote")
              : t("bk.builtInNote")}
          </p>
        </div>

        <div className="grid gap-3">
          <h3 className="text-sm font-semibold">{t("bk.business")}</h3>
          <label className="grid gap-1">
            <span className="form-label">{t("bk.displayName")}</span>
            <input
              className="field"
              aria-label={t("bk.displayName")}
              value={form.displayName ?? ""}
              maxLength={DISPLAY_NAME_MAX}
              autoComplete="organization"
              placeholder={t("bk.yourBusiness")}
              onChange={(e) => setForm({ ...form, displayName: e.target.value || null })}
            />
            {nameFromBusiness ? <span className="text-xs text-muted">{t("bk.fromBusiness")}</span> : null}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="form-label">{t("bk.phone")}</span>
              <input
                className="field"
                aria-label={t("bk.phone")}
                type="tel"
                value={form.phone ?? ""}
                maxLength={PHONE_MAX}
                autoComplete="tel"
                placeholder="(415) 555-0100"
                onChange={(e) => setForm({ ...form, phone: e.target.value || null })}
                onBlur={() => setPhoneTouched(true)}
                aria-describedby={phoneError ? "brand-phone-error" : undefined}
              />
              {phoneError ? <span id="brand-phone-error" role="alert" className="text-xs text-danger">{phoneError}</span> : null}
            </label>
            <label className="grid gap-1">
              <span className="form-label">{t("bk.website")}</span>
              <input
                className="field"
                aria-label={t("bk.website")}
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
          <h3 className="text-sm font-semibold">{t("bk.logo")}</h3>
          {logoSrc ? (
            <div className="flex items-center gap-3">
              <img src={logoSrc} alt="" className="size-14 rounded-lg object-contain border border-line bg-paper" />
              <p className="text-sm font-medium truncate">{logo?.fileName}</p>
            </div>
          ) : null}
          <label className="grid gap-1">
            <span className="form-label">{t("bk.logo")}</span>
            <select className="field min-w-56" value={form.logoMediaId ?? ""} onChange={(e) => setForm({ ...form, logoMediaId: e.target.value || null })}>
              <option value="">{t("bk.noLogo")}</option>
              {images.map((m) => (
                <option key={m.id} value={m.id}>{m.fileName}</option>
              ))}
            </select>
          </label>
          <DirectImageUpload
            what="logo"
            library={images}
            disabled={!onLogoUploaded}
            onUploaded={async (id) => { await onLogoUploaded?.(id); }}
          />
          {!images.length ? <p className="text-xs text-muted">{t("bk.noLogos")}</p> : null}
        </div>

        <div className="grid gap-3">
          <h3 className="text-sm font-semibold">{t("bk.colours")}</h3>
          <div className="flex flex-wrap gap-4 items-end">
            {colour("primaryColor", t("bk.main"))}
            {colour("accentColor", t("bk.highlight"))}
            {colour("textColor", t("bk.text"), true)}
            {colour("backgroundColor", t("bk.background"), true)}
          </div>
          {!valid ? <p className="text-sm text-danger" role="alert">{t("bk.colourHint")}</p> : null}
        </div>

        <div className="grid gap-3">
          <h3 className="text-sm font-semibold">{t("bk.fonts")}</h3>
          <p className="text-xs text-muted">{t("bk.fontsNote")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="form-label">{t("bk.heading")}</span>
              <select
                className="field"
                aria-label={t("bk.headingFont")}
                value={form.headingFont ?? ""}
                onChange={(e) => setForm({ ...form, headingFont: (e.target.value || null) as BrandFont | null })}
              >
                <option value="">{t("bk.fontDefault")}</option>
                {FONT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} style={{ fontFamily: opt.family }}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="form-label">{t("bk.body")}</span>
              <select
                className="field"
                aria-label={t("bk.bodyFont")}
                value={form.bodyFont ?? ""}
                onChange={(e) => setForm({ ...form, bodyFont: (e.target.value || null) as BrandFont | null })}
              >
                <option value="">{t("bk.fontDefault")}</option>
                {FONT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} style={{ fontFamily: opt.family }}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

      </section>

      <aside className="card p-5 md:p-6" aria-label={t("bk.previewAria")}>
        <h2 className="text-lg font-semibold">{t("bk.preview")}</h2>
        <p className="text-sm text-muted mt-1 mb-4">{t("bk.previewNote")}</p>
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
              <span className="font-medium">{t("bk.featured")}</span>
              <span
                className="rounded-full px-2.5 py-0.5 text-sm font-semibold"
                style={{ background: accent, color: "#1a1a1a", fontFamily: bodyFamily }}
              >
                $12
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>{t("bk.special")}</span>
              <span
                className="rounded-full px-2.5 py-0.5 text-sm font-semibold"
                style={{ background: accent, color: "#1a1a1a", fontFamily: bodyFamily }}
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
          <button type="button" className="btn btn-primary min-h-11" disabled={!valid || busy !== null} onClick={onSave}>{busy === "save" ? t("bk.saving") : t("bk.save")}</button>
          <p className={`mt-2 text-sm ${saveResult && !saveResult.ok ? "text-danger" : "text-muted"}`} role={saveResult && !saveResult.ok ? "alert" : "status"} aria-live="polite" data-testid="brand-save-result">
            {saveResult?.text ?? ""}
          </p>
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
  const t = useT();
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
          <h2 id="brand-summary-heading" className="font-semibold">{t("bk.yourBrand")}</h2>
          <p className="text-sm text-muted truncate">
            {brand.custom
              ? [name, logo?.fileName, main, highlight].filter(Boolean).join(" · ")
              : t("bk.summaryBuiltIn")}
          </p>
        </div>
      </div>
      <Link href="/dashboard/account/brand-kit" className="btn btn-quiet shrink-0">{t("bk.edit")}</Link>
    </section>
  );
}
