"use client";
/**
 * Premium menu templates: the gallery shown by "New menu board" and the guided editor
 * (Business → Menu → Photos → Look). Behind the MENU_TEMPLATES rollout flag (lib/menu-templates-flag.ts).
 *
 * The preview is the exact SVG the server turns into the TV image (lib/menu-design-svg.ts), so what the owner sees
 * here is what the screen shows. Saving reuses POST /api/layout-studio (draft never moves a screen; publish swaps
 * the image on the screens already showing the board) and POST /api/layout-studio/assign for new screens.
 */
import { IconImage } from "@/components/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, authToken, uploadForm, useApi, type DisplayItem, type MediaItem } from "@/lib/api";
import { useLocale, useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/en";
import { Dialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { useRegisterStudioLeave } from "@/components/studio-leave";
import { fontFaceCss } from "@/lib/board-fonts";
import { MENU_LIMITS, layoutSvg, parseLayout, sampleLayout, type LayoutDocument, type LayoutTemplate } from "@/lib/layout-studio";
import { accountSaveBody, findSameVideo, readAccountStudio, selectFeaturedMedia, type AccountLibraryFile } from "@/lib/layout-account";
import { isProcessingMediaStatus, isReadyMediaStatus } from "@/lib/media-ready";
import { mediaHits, selectedVideoOption, videoPreview } from "@/lib/board-preview";
import { ZoneVideo } from "@/components/zone-video";
import { BOARD_FONTS, isBoardFont, isClassicFont } from "@/lib/board-fonts";
import { ColorField } from "@/components/color-field";
import { menuSvg } from "@/lib/menu-classic-svg";
import { boardCanvas, orientationOf, type BoardOrientation } from "@/lib/board-orientation";
import { parseMenuContent, sampleMenu } from "@/lib/menu-templates";
import { seedClassicMenu } from "@/lib/brand-kit";
import { blobToBase64, prepareVideo, uploadToSignedUrl } from "@/lib/prepare-video";
import { asUploadImage } from "@/lib/prepare-image";
import { IMAGE_UPLOAD_ACCEPT, VIDEO_UPLOAD_ACCEPT, isImageUploadFile, isVideoUploadFile } from "@/lib/media-accept";
import {
  ORIGINAL_LAYOUTS, classicSaveContent, engineOf, filterGallery, fixedColumns, fromClassic, galleryEntries, layoutMedia, layoutReport,
  mergeExtraSections, newLayoutDocument, switchToLayout, toClassic,
  type ClassicSettings, type Engine, type GalleryEntry, type Structure,
} from "@/lib/menu-designer";
import {
  MENU_DESIGNS, designById, designDocument, designHasMedia, filterDesigns, isPhotoDesign, scratchDocument, stockPhotoPath, switchDesign,
  type DesignBusiness, type DesignStyle, type MenuDesign,
} from "@/lib/menu-designs";
import { designColors, designSvgWithReport, hasOwnerItemPhoto, itemPhotosShown } from "@/lib/menu-design-svg";
import { customOverflow, roomierDesignId, safeResetPaths } from "@/lib/board-fit";
import { applyCustomReset, customizationSpec } from "@/lib/board-custom";
import { CustomizeLook, type HeadingScope } from "@/components/menu-customize";
import { boardSvgWithReport } from "@/lib/layout-studio";
import type { Brand } from "@/lib/brand-kit";
import { moveItem, splitLastItems, withItemPhoto } from "@/lib/menu-item-photos";

const FONT_CSS = fontFaceCss();

/**
 * Unified menu designer flag for this account (server-checked, UNIFIED_MENU_EDITOR). Null while loading.
 * `?unified=off` opts this browser out (back to the previous editors), `?unified=on` opts back in.
 */
export function useUnifiedEditorFlag(skip = false): boolean | null {
  const flag = useApi<{ enabled: boolean; unified?: boolean }>(skip ? null : "/api/menu-templates");
  const [optOut, setOptOut] = useState(false);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("unified");
      if (q === "off") localStorage.setItem("pekko_unified_optout", "1");
      if (q === "on") localStorage.removeItem("pekko_unified_optout");
      setOptOut(localStorage.getItem("pekko_unified_optout") === "1");
    } catch { /* private window */ }
  }, []);
  if (skip) return false;
  if (flag.error) return false;
  if (!flag.data) return null;
  return Boolean(flag.data.unified) && flag.data.enabled && !optOut;
}

/** Rollout flag for this account (server-checked). Null while loading. `?templates=off` opts this browser out. */
export function useMenuTemplatesFlag(skip = false): boolean | null {
  const flag = useApi<{ enabled: boolean }>(skip ? null : "/api/menu-templates");
  const [optOut, setOptOut] = useState(false);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("templates");
      if (q === "off") localStorage.setItem("pekko_templates_optout", "1");
      if (q === "on") localStorage.removeItem("pekko_templates_optout");
      setOptOut(localStorage.getItem("pekko_templates_optout") === "1");
    } catch { /* private window */ }
  }, []);
  if (skip) return false;
  if (flag.error) return false;
  if (!flag.data) return null;
  return flag.data.enabled && !optOut;
}

type Art = { imageHref: string | null; logoHref: string | null; itemImages?: Record<string, string>; imageSize?: { w: number; h: number } | null };

/** The board exactly as the TV will show it. */
export function DesignBoard({ doc, art, label, className = "" }: { doc: LayoutDocument; art: Art; label?: string; className?: string }) {
  const svg = useMemo(() => designSvgWithReport(doc, { imageHref: art.imageHref, logoHref: art.logoHref, itemImages: art.itemImages }).svg, [doc, art.imageHref, art.logoHref, art.itemImages]);
  return (
    <div className={`tpl-board ${orientationOf(doc) === "portrait" ? "is-portrait " : ""}${className}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

const STYLES = `${FONT_CSS}
.tpl-board { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; background: #000; }
.tpl-board.is-portrait { aspect-ratio: 9 / 16; width: min(100%, calc(75dvh * 9 / 16)); margin-inline: auto; }
.tpl-orient { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.tpl-orient button { display: flex; align-items: center; gap: 10px; text-align: start; }
.tpl-orient .tpl-orient-shape { flex: none; border: 2px solid currentColor; border-radius: 3px; opacity: .7; }
.tpl-board-svg, .tpl-board-svg > svg, .tpl-board > svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.tpl-zone-hit { position: absolute; z-index: 3; padding: 0; cursor: pointer; background: transparent; border: 2px solid transparent; }
.tpl-zone-hit:hover, .tpl-zone-hit:focus-visible { border-color: var(--color-primary); outline: none; }
.tpl-zone-hit.tpl-region-hit > span { opacity: 0; }
.tpl-zone-hit.tpl-region-hit:hover > span, .tpl-zone-hit.tpl-region-hit:focus-visible > span { opacity: 1; }
.tpl-zone-hit > span { position: absolute; left: 6px; top: 6px; max-width: calc(100% - 12px); overflow: hidden; text-overflow: ellipsis; background: rgb(11 18 32 / .72); color: #fff; border-radius: 6px; padding: 2px 7px; font-size: 11px; font-weight: 700; line-height: 14px; }
/* Gallery filters: one label column shared by every row (so all button groups start at the same x), and Pekko's
   segmented control (.seg, as on My Screens) for the buttons. Phones stack the label above its buttons. */
.tpl-filters { display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 16px; row-gap: 10px; align-items: start; }
/* 40px = one row of the segmented control (34px buttons + 3px track padding), so a label lines up with the first
   row of its buttons even when they wrap. */
.tpl-filter-label { display: flex; align-items: center; min-height: 40px; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--color-muted); }
.tpl-filter-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.tpl-filter-controls .seg > button { display: inline-flex; align-items: center; gap: 6px; }
.tpl-filter-controls .seg > button svg { width: 16px; height: 16px; flex: none; }
@media (max-width: 639px) { .tpl-filters { grid-template-columns: minmax(0, 1fr); row-gap: 6px; } .tpl-filter-label { min-height: 0; } .tpl-filter-label:not(:first-child) { margin-top: 6px; } }
.tpl-card { display: flex; flex-direction: column; gap: 10px; text-align: left; padding: 10px; border: 1px solid var(--color-line); border-radius: 14px; background: #fff; transition: border-color .15s, box-shadow .15s, transform .15s; }
.tpl-card:hover { border-color: var(--color-primary); box-shadow: 0 10px 26px rgb(11 18 32 / .1); transform: translateY(-2px); }
.tpl-card .tpl-board { border-radius: 9px; }
.tpl-card:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 2px; }
/* Card text: the description reserves two lines so tags start at the same height in a row; the button sits at the
   bottom of every card (margin-top: auto), so buttons line up across a row however long the text is. */
.tpl-card-desc { min-height: 2.5rem; }
.tpl-card-cta { margin-top: auto; align-self: flex-start; }
.tpl-card.is-scratch { border-style: dashed; background: #fbfcfe; }
.tpl-card.is-scratch .tpl-blank { aspect-ratio: 16 / 9; border-radius: 9px; border: 2px dashed var(--color-line); display: grid; place-items: center; font-size: 28px; font-weight: 700; color: var(--color-muted); background: #fff; }
.tpl-card.is-scratch:hover .tpl-blank { border-color: var(--color-primary); color: var(--color-primary); }
.tpl-tag { font-size: 11px; font-weight: 600; color: #33415a; background: #eef2f8; border-radius: 6px; padding: 2px 7px; }
.tpl-tv { border-radius: 10px; box-shadow: 0 0 0 6px #0b0f17, 0 0 0 7px #2a3242, 0 16px 40px rgb(8 15 30 / .3); }
.tpl-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; padding: 4px; border-radius: 12px; background: #e9eef6; }
.tpl-steps button { border: 0; background: transparent; border-radius: 9px; padding: 9px 4px; font-size: 13px; font-weight: 700; color: #4a5872; min-height: 40px; }
.tpl-steps button[aria-current="step"] { background: #fff; color: var(--color-ink); box-shadow: 0 1px 3px rgb(11 18 32 / .12); }
.tpl-sec { border: 1px solid var(--color-line); border-radius: 12px; overflow: hidden; background: #fff; }
.tpl-sec-h { display: flex; gap: 6px; align-items: center; padding: 8px; background: #f6f8fc; border-bottom: 1px solid var(--color-line); }
.tpl-item { display: grid; grid-template-columns: 64px minmax(0, 1fr) 92px auto; gap: 6px; padding: 8px; border-bottom: 1px solid #edf1f7; }
.tpl-item:last-child { border-bottom: 0; }
.tpl-item .tpl-photo { grid-row: 1 / 3; grid-column: 1; width: 64px; height: 64px; align-self: start; border-radius: 10px; border: 1px dashed #9aa8bf; background: #f6f8fc; overflow: hidden; padding: 0; font-size: 11px; font-weight: 700; color: #33415a; line-height: 1.2; }
.tpl-item .tpl-photo { position: relative; }
.tpl-item .tpl-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.tpl-item .tpl-photo:has(img) { border-style: solid; border-color: var(--color-line); }
.tpl-item .desc { grid-column: 2 / 4; }
.tpl-item .acts { grid-row: 1 / 3; grid-column: 4; display: flex; flex-direction: column; gap: 3px; }
@media (max-width: 420px) { .tpl-item { grid-template-columns: 52px minmax(0, 1fr) 76px auto; } .tpl-item .tpl-photo { width: 52px; height: 52px; } }
.tpl-ib { width: 32px; height: 30px; border: 1px solid var(--color-line); background: #fff; border-radius: 7px; display: grid; place-items: center; font-size: 13px; padding: 0; }
.tpl-ib:disabled { opacity: .35; }
.tpl-ib { flex: none; }
.tpl-sec-h { flex-wrap: wrap; }
.tpl-sec-h > .field { flex: 1 1 8rem; min-width: 0; }
.tpl-lib { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 8px; }
.tpl-lib button { border: 2px solid transparent; padding: 0; border-radius: 9px; overflow: hidden; aspect-ratio: 1; background: #ddd; }
.tpl-lib button[aria-pressed="true"] { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgb(26 92 255 / .25); }
.tpl-lib img { width: 100%; height: 100%; object-fit: cover; display: block; }
.tpl-media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; max-height: 320px; overflow-y: auto; padding: 2px; }
.tpl-media-card { position: relative; display: grid; grid-template-rows: 76px auto; gap: 6px; padding: 6px; border: 2px solid var(--color-line); border-radius: 12px; background: #fff; text-align: left; min-width: 0; transition: border-color .15s, box-shadow .15s; }
.tpl-media-card:hover:not(:disabled) { border-color: #9eb8eb; }
.tpl-media-card[aria-pressed="true"] { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgb(26 92 255 / .22); background: #f6f9ff; }
.tpl-media-card:disabled { opacity: .68; cursor: not-allowed; }
.tpl-media-card:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 2px; }
.tpl-media-thumb { position: relative; width: 100%; height: 100%; border-radius: 8px; overflow: hidden; background: #101726; display: grid; place-items: center; }
.tpl-media-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.tpl-media-video-empty { color: #dbe6ff; font-size: 18px; line-height: 1; }
.tpl-media-badge { position: absolute; left: 5px; bottom: 5px; display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 999px; background: rgb(11 18 32 / .84); color: #fff; font-size: 10px; font-weight: 700; line-height: 1.2; }
.tpl-media-check { position: absolute; top: 5px; right: 5px; width: 22px; height: 22px; border-radius: 999px; background: var(--color-primary); color: #fff; font-size: 12px; font-weight: 800; display: grid; place-items: center; box-shadow: 0 2px 6px rgb(11 18 32 / .28); }
.tpl-media-meta { min-width: 0; display: grid; gap: 2px; }
.tpl-media-name { display: block; font-size: 12px; font-weight: 600; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.tpl-media-status { display: inline-block; justify-self: start; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; }
.tpl-media-status.is-processing { background: #fff4d6; color: #8a5b00; }
.tpl-media-status.is-failed { background: #fdecea; color: #b8342a; }
.tpl-none-btn[aria-pressed="true"] { border-color: var(--color-primary); background: #f0f5ff; color: var(--color-primary); font-weight: 700; }
.tpl-var { border: 2px solid var(--color-line); background: #fff; border-radius: 11px; padding: 6px; display: grid; gap: 6px; text-align: left; font-size: 12px; font-weight: 700; }
.tpl-var[aria-pressed="true"] { border-color: var(--color-primary); }
.tpl-sw { display: flex; height: 24px; border-radius: 7px; overflow: hidden; box-shadow: inset 0 0 0 1px rgb(0 0 0 / .08); }
.tpl-sw span { flex: 1; }
.tpl-ck { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; padding: 7px 10px; border-radius: 9px; background: #f0f8f4; color: #0a5c3e; }
.tpl-ck.adj { background: #fff6e5; color: #7a4a00; }
.tpl-grid { display: grid; gap: 20px; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1100px) { .tpl-grid { grid-template-columns: minmax(360px, 420px) minmax(0, 1fr); align-items: start; } .tpl-preview { position: sticky; top: 72px; grid-column: 2; grid-row: 1; } .tpl-form { grid-column: 1; grid-row: 1; } }
/* Expand preview is mobile-only, so the desktop layout stays unchanged. */
.tpl-expand-preview { display: none; }
@media (max-width: 1099px) {
  .tpl-preview { position: sticky; top: 56px; z-index: 5; background: var(--color-paper, #f1f4fa); padding-bottom: 10px; }
  /* Portrait: a width-from-height 9:16 box, capped so Step 4 controls stay reachable.
     Static (not sticky) so the preview cannot cover the form as the page scrolls.
     svh accounts for iOS Safari toolbars; dvh/vh are fallbacks. */
  .tpl-preview.is-portrait { position: static; z-index: auto; }
  .tpl-preview.is-portrait .tpl-board.is-portrait {
    width: min(100%, calc(50vh * 9 / 16));
    width: min(100%, calc(50dvh * 9 / 16));
    width: min(100%, calc(50svh * 9 / 16));
    max-height: 50vh;
    max-height: 50dvh;
    max-height: 50svh;
    aspect-ratio: 9 / 16;
    margin-inline: auto;
  }
  .tpl-preview.is-portrait .tpl-expand-preview { display: inline-flex; align-self: center; }
}
.tpl-preview-overlay { background: transparent; box-shadow: none; width: max-content; max-width: calc(100vw - 24px); padding: 0; }
.tpl-preview-overlay-inner { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: max(12px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px)); }
.tpl-preview-overlay .tpl-board.is-portrait {
  width: min(calc(100vw - 24px), calc((100vh - 6rem) * 9 / 16));
  width: min(calc(100vw - 24px), calc((100dvh - 6rem) * 9 / 16));
  width: min(calc(100vw - 24px), calc((100svh - 6rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) * 9 / 16));
  max-height: calc(100vh - 6rem);
  max-height: calc(100dvh - 6rem);
  max-height: calc(100svh - 6rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  aspect-ratio: 9 / 16;
  margin-inline: auto;
}
@media (prefers-reduced-motion: reduce) { .tpl-card { transition: none; } .tpl-card:hover { transform: none; } }
.tpl-board > svg { font-family: Inter, sans-serif; }
.tpl-col { flex: none; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: #0a5c3e; background: #e6f6ee; border-radius: 6px; padding: 3px 7px; }
.tpl-col.off { color: #7a4a00; background: #fff6e5; }
.tpl-sec-off { opacity: .72; }
.tpl-adv { border: 1px solid var(--color-line); border-radius: 12px; padding: 10px 12px; background: #fff; }
.tpl-adv > summary { cursor: pointer; font-weight: 700; font-size: 14px; min-height: 28px; display: flex; align-items: center; }
`;

const BUSINESSES: (DesignBusiness | "all")[] = ["all", "restaurant", "cafe", "fast", "bar", "sweets", "salon", "retail", "fitness"];
const STYLE_IDS: (DesignStyle | "all")[] = ["all", "dark", "light", "bold"];

/* ------------------------------------------------------------------ gallery ------------------------------------------------------------------ */

export function TemplateGallery({ onPick, onCancel, onAdvanced }: { onPick: (doc: LayoutDocument, name: string) => void; onCancel: () => void; onAdvanced: () => void }) {
  const { locale, t } = useLocale();
  const [business, setBusiness] = useState<DesignBusiness | "all">("all");
  const [style, setStyle] = useState<DesignStyle | "all">("all");
  const shown = filterDesigns(business, style);
  const noArt: Art = { imageHref: null, logoHref: null };
  return (
    <section className="mb-6" data-testid="template-gallery" aria-labelledby="tpl-gallery-title">
      <style>{STYLES}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="tpl-gallery-title" className="font-display text-2xl font-bold">{t("tpl.galleryTitle")}</h2>
          <p className="text-sm text-muted mt-1">{t("tpl.galleryLede")}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-quiet" onClick={onAdvanced}>{t("tpl.layoutsInstead")}</button>
          <button type="button" className="btn btn-quiet" onClick={onCancel}>{t("tpl.cancel")}</button>
        </div>
      </div>
      <div className="tpl-filters mt-4" data-testid="gallery-filters">
        <FilterRow id="tpl-f-business" label={t("tpl.filterBusiness")}>
          {BUSINESSES.map((id) => (
            <button key={id} type="button" aria-pressed={business === id} onClick={() => setBusiness(id)}>{t(`tpl.business.${id}` as MessageKey)}</button>
          ))}
        </FilterRow>
        <FilterRow id="tpl-f-style" label={t("tpl.filterStyle")}>
          {STYLE_IDS.map((id) => (
            <button key={id} type="button" aria-pressed={style === id} onClick={() => setStyle(id)}>{t(`tpl.style.${id}` as MessageKey)}</button>
          ))}
        </FilterRow>
      </div>
      <p className="sr-only" role="status">{t("tpl.count", { n: shown.length })}</p>
      <ul className="grid gap-4 mt-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("tpl.galleryTitle")}>
        {shown.map((design) => (
          <li key={design.id} className="min-w-0 flex">
            <button type="button" className="tpl-card w-full" data-testid={`template-${design.id}`}
              onClick={() => onPick(designDocument(design), design.name[locale === "es" ? "es" : "en"])}>
              <DesignBoard doc={designDocument(design)} art={noArt} />
              <span className="font-display font-bold text-[15px]">{design.name[locale === "es" ? "es" : "en"]}</span>
              <span className="text-sm text-muted tpl-card-desc">{design.blurb[locale === "es" ? "es" : "en"]}</span>
              <span className="flex flex-wrap gap-1.5">
                <span className="tpl-tag">{t(`tpl.business.${design.business}` as MessageKey)}</span>
                <span className="tpl-tag">{t(`tpl.style.${design.style}` as MessageKey)}</span>
                <span className="tpl-tag">{t("tpl.colourStyles", { n: design.variants.length })}</span>
                {isPhotoDesign(design) ? <span className="tpl-tag">{t("tpl.itemPhotosTag")}</span> : null}
              </span>
              <span className="btn btn-primary min-h-10 tpl-card-cta" aria-hidden>{t("tpl.use")}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 ? <li className="text-sm text-muted">{t("tpl.noMatch")}</li> : null}
        <ScratchCard onPick={() => onPick(scratchDocument(), "")} />
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ editor ------------------------------------------------------------------ */

type Step = 0 | 1 | 2 | 3;
const blankItem = () => ({ name: "", price: "", description: "" });
function itemCount(doc: LayoutDocument) { return doc.sections.reduce((a, s) => a + s.items.length, 0); }

/** What the board can't show, in one shape for every engine. */
type Fit = { dropped: number; scale: number; hiddenSections: number; clipped: string[]; photosSuppressed?: boolean };

/** Classic boards draw with the classic renderer; the browser gets the same SVG the server rasterises. */
function classicArt(classic: ClassicSettings, brand: Brand | null, art: Art) {
  const kit = classic.useBrand && brand?.custom ? brand : null;
  return {
    brand: kit ? { primaryColor: kit.primaryColor, accentColor: kit.accentColor } : null,
    logo: kit?.logoMediaId ? art.logoHref : null,
    photo: art.imageHref,
    itemImages: art.itemImages,
  };
}

/** The board as the TV shows it, plus a live muted video overlay when the editor has a zone video. */
export function BoardView({ engine, doc, classic, art, brand, label, className = "", video = null, hits, onHit }: {
  engine: Engine; doc: LayoutDocument; classic: ClassicSettings | null; art: Art; brand: Brand | null; label?: string; className?: string;
  video?: ReturnType<typeof videoPreview>;
  hits?: { id: string; label: string; box: { x: number; y: number; w: number; h: number }; region?: boolean }[];
  onHit?: (id: string) => void;
}) {
  const t = useT();
  const canvas = boardCanvas(orientationOf(doc));
  const svg = useMemo(() => {
    if (engine === "classic" && classic) {
      const { template, content } = toClassic(doc, classic);
      return menuSvg(template, content, classicArt(classic, brand, art));
    }
    if (engine === "layout") return layoutSvg(doc, { imageHref: art.imageHref, itemImages: art.itemImages, ...(art.imageSize ? { imageSize: art.imageSize } : {}) });
    return designSvgWithReport(doc, { imageHref: art.imageHref, logoHref: art.logoHref, itemImages: art.itemImages, ...(art.imageSize ? { imageSize: art.imageSize } : {}) }).svg;
  }, [engine, doc, classic, art.imageHref, art.logoHref, art.itemImages, art.imageSize, brand]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`tpl-board ${orientationOf(doc) === "portrait" ? "is-portrait " : ""}${className}`} data-orientation={orientationOf(doc)} role={label && !hits?.length ? "img" : undefined} aria-label={label && !hits?.length ? label : undefined}>
      <div className="tpl-board-svg" aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
      {video ? (
        <ZoneVideo
          box={video.box}
          src={video.src}
          poster={video.poster}
          fileName={video.fileName}
          label={video.fileName ? t("tpl.videoOnBoard", { name: video.fileName }) : t("tpl.videoUnlisted")}
          fallbackLabel={t("tpl.videoUnlisted")}
          canvas={canvas}
        />
      ) : null}
      {(hits ?? []).map((hit) => (
        <button
          key={hit.id}
          type="button"
          className={hit.region ? "tpl-zone-hit tpl-region-hit" : "tpl-zone-hit"}
          data-testid={`tpl-hit-${hit.id}`}
          aria-label={hit.label}
          onClick={() => onHit?.(hit.id)}
          style={{
            left: `${(hit.box.x / canvas.width) * 100}%`,
            top: `${(hit.box.y / canvas.height) * 100}%`,
            width: `${(hit.box.w / canvas.width) * 100}%`,
            height: `${(hit.box.h / canvas.height) * 100}%`,
          }}
        >
          <span>{hit.label}</span>
        </button>
      ))}
    </div>
  );
}

export function TemplateEditor({
  menuId: initialMenuId, name: initialName, document: initialDoc, displays, brand, preview = false, onClose, onAdvanced, onSaved, onSplit,
  unified = false, classic: initialClassic = null, onNewBoard, fixtureLibrary,
}: {
  menuId: string | null;
  name: string;
  document: LayoutDocument;
  displays: DisplayItem[] | null;
  brand: Brand | null;
  preview?: boolean;
  onClose: () => void;
  onAdvanced: (menuId: string) => void;
  onSaved?: () => void;
  /** Open a new board with the items that didn't fit (same design). */
  onSplit?: (document: LayoutDocument, name: string, classic?: ClassicSettings | null) => void;
  /** Unified menu designer (UNIFIED_MENU_EDITOR): every board type, Advanced options, no second editor. */
  unified?: boolean;
  /** Set when this is a classic full-screen board. */
  classic?: ClassicSettings | null;
  /** Start a NEW board with this content in another design (classic boards can't change storage type in place). */
  onNewBoard?: (document: LayoutDocument, name: string) => void;
  /** Preview harness only: the fixture media library, including videos. */
  fixtureLibrary?: AccountLibraryFile[];
}) {
  const { locale, t } = useLocale();
  const L = locale === "es" ? "es" : "en";
  const toast = useToast();
  const [doc, setDoc] = useState<LayoutDocument>(initialDoc);
  const [classic, setClassic] = useState<ClassicSettings | null>(initialClassic);
  const [name, setName] = useState(initialName || initialDoc.title || t("tpl.untitled"));
  const [menuId, setMenuId] = useState<string | null>(initialMenuId);
  const [step, setStep] = useState<Step>(0);
  const [dirty, setDirty] = useState(!initialMenuId);
  const [busy, setBusy] = useState<null | "draft" | "publish" | "upload">(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [library, setLibrary] = useState<AccountLibraryFile[]>([]);
  const [mediaFilter, setMediaFilter] = useState<"all" | "photos" | "videos">("all");
  const [publishOpen, setPublishOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [published, setPublished] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useRegisterStudioLeave(() => dirtyRef.current);
  const engine: Engine = engineOf(doc, classic);
  const isDesign = engine === "design";
  const design = designById(doc.design) ?? designById("coffee-shop")!;

  async function reloadLibrary() {
    if (preview) {
      // UI preview only (no account): two bundled sample photos stand in for the owner's media.
      // Fixture videos (and any other library files) stay available so a selected video can preview.
      const sample: AccountLibraryFile[] = ["salad", "bowl"].map((n) => ({ id: `00000000-0000-4000-8000-00000000f00${n === "salad" ? 1 : 2}`, name: `${n}.jpg`, kind: "image", mime: "image/jpeg", url: `/menu-templates/${n}.jpg` }));
      const extras = (fixtureLibrary ?? []).filter((item) => !sample.some((row) => row.id === item.id));
      const next = [...sample, ...extras];
      setLibrary(next);
      return next;
    }
    const [studioRaw, mediaRaw] = await Promise.all([
      api("/api/layout-studio"),
      api<MediaItem[] | { items?: MediaItem[] }>("/api/media").catch(() => null),
    ]);
    const body = readAccountStudio(studioRaw);
    const ready = body?.library ?? [];
    const mediaRows = Array.isArray(mediaRaw) ? mediaRaw : Array.isArray(mediaRaw?.items) ? mediaRaw.items : [];
    const seen = new Set(ready.map((f) => f.id));
    const pendingOrFailed: AccountLibraryFile[] = [];
    for (const row of mediaRows) {
      if (row.kind !== "video" || seen.has(row.id) || isReadyMediaStatus(row.processingStatus)) continue;
      pendingOrFailed.push({
        id: row.id,
        name: row.fileName,
        kind: "video",
        mime: "video/mp4",
        url: null,
        sizeBytes: row.sizeBytes ?? null,
        thumbnailUrl: row.thumbnailUrl ?? null,
        processingStatus: row.processingStatus ?? "processing",
        processingError: row.processingError ?? null,
      });
    }
    const next = [...ready, ...pendingOrFailed];
    setLibrary(next);
    return next;
  }
  useEffect(() => { void reloadLibrary().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (preview || !library.some((f) => isProcessingMediaStatus(f.processingStatus))) return;
    const timer = setInterval(() => { void reloadLibrary().catch(() => {}); }, 4000);
    return () => clearInterval(timer);
  }, [library, preview]); // eslint-disable-line react-hooks/exhaustive-deps

  const urlFor = (id: string | null | undefined) => (id ? library.find((f) => f.id === id)?.url ?? null : null);
  // Item photos in the preview use the same signed library URLs the photo picker shows.
  const itemImages = useMemo(() => Object.fromEntries(library.filter((f) => f.kind === "image" && f.url).map((f) => [f.id, f.url as string])), [library]);
  // Classic boards show the Brand Kit logo (when "Use my Brand Kit" is on); templates show the board's own logo.
  const logoId = engine === "classic" ? brand?.logoMediaId : doc.logoMediaId;
  // Natural size of the featured photo, so a focal point places it exactly as the server PNG does.
  const photoSrc = urlFor(doc.imageMediaId) ?? (isDesign && doc.stockPhoto ? `/menu-templates/${doc.stockPhoto}.jpg` : null);
  const [imageSize, setImageSize] = useState<{ src: string; w: number; h: number } | null>(null);
  useEffect(() => {
    if (!photoSrc || imageSize?.src === photoSrc || typeof Image === "undefined") return;
    const img = new Image();
    img.onload = () => { if (img.naturalWidth && img.naturalHeight) setImageSize({ src: photoSrc, w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = photoSrc;
  }, [photoSrc]); // eslint-disable-line react-hooks/exhaustive-deps
  const sizeNow = imageSize && imageSize.src === photoSrc ? imageSize : null;
  const imageSizeMemo = useMemo(() => (sizeNow ? { w: sizeNow.w, h: sizeNow.h } : null), [sizeNow?.w, sizeNow?.h]); // eslint-disable-line react-hooks/exhaustive-deps
  const art: Art = { imageHref: urlFor(doc.imageMediaId), logoHref: urlFor(logoId), itemImages, imageSize: imageSizeMemo };
  const [czOpen, setCzOpen] = useState(false);
  const [czScope, setCzScope] = useState<HeadingScope>("all");
  // Guided customization: overflow the owner's size changes add (never an existing board's own fit), and the
  // targeted reset that removes it. Same functions as the preview API and publish (lib/board-fit.ts).
  const czOverflow = useMemo(() => (engine === "classic" ? [] : customOverflow(doc)), [engine, doc]);
  const czSafe = useMemo(() => (czOverflow.length ? safeResetPaths(doc) : null), [czOverflow, doc]);
  const fit: Fit = useMemo(() => {
    if (engine === "design") { const r = designSvgWithReport(doc, art).report; return { dropped: r.dropped, scale: r.scale, hiddenSections: 0, clipped: [], photosSuppressed: r.photosSuppressed }; }
    if (engine === "layout") { const r = layoutReport(doc, art); return { dropped: r.hiddenItems, scale: 1, hiddenSections: r.hiddenSections, clipped: r.clipped }; }
    return { dropped: 0, scale: 1, hiddenSections: 0, clipped: [] };
  }, [engine, doc, art.imageHref, art.logoHref, itemImages]); // eslint-disable-line react-hooks/exhaustive-deps
  const [photoFor, setPhotoFor] = useState<{ si: number; ii: number } | null>(null);
  function setItemPhoto(si: number, ii: number, imageMediaId: string | null) {
    update({ ...doc, sections: withItemPhoto(doc.sections, si, ii, imageMediaId) });
    if (imageMediaId) toast.show(t("tpl.photoAdded"));
  }
  function moveItemAt(si: number, ii: number, dir: -1 | 1) { update({ ...doc, sections: moveItem(doc.sections, si, ii, dir) }); }
  /** Move the items that don't fit (the last ones in reading order) to a new board with the same design. */
  function splitOverflow() {
    const split = splitLastItems(doc.sections, fit.dropped);
    const kept = { ...doc, sections: split.kept };
    update(kept);
    // Keep this board safe first (as a draft), then open the new board with the moved items.
    void (async () => {
      const saved = preview ? "preview" : await save("draft", kept);
      if (saved) onSplit?.({ ...doc, sections: split.moved }, `${name} (2)`, classic);
    })();
  }
  const colors = useMemo(() => designColors(doc, design), [doc, design]);

  function update(next: LayoutDocument) { setDoc(next); setDirty(true); }
  /** Horizontal ⇄ vertical: only the canvas changes; every word, price, photo, video and setting stays in the board. */
  function setOrientation(value: BoardOrientation) {
    if (orientationOf(doc) === value) return;
    const next: LayoutDocument = { ...doc };
    if (value === "portrait") next.orientation = "portrait";
    else {
      delete next.orientation;
      setPreviewExpanded(false);
    }
    update(next);
  }
  function patch(p: Partial<LayoutDocument>) { update({ ...doc, ...p }); }
  function patchClassic(p: Partial<ClassicSettings>) { if (classic) { setClassic({ ...classic, ...p }); setDirty(true); } }
  function setSections(fn: (s: LayoutDocument["sections"]) => LayoutDocument["sections"]) { update({ ...doc, sections: fn(doc.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) }))) }); }

  const media = engine === "layout" ? layoutMedia(doc.template) : null;
  const supportsVideo = engine === "design" ? designHasMedia(design) : engine === "layout" ? Boolean(media?.video) : false;
  /** Selecting featured media picks one primary item (photo, video, sample, or none) and immediately updates the preview. */
  function setBoardPhoto(id: string | null) {
    if (!id) { clearFeaturedMedia(); return; }
    update(selectFeaturedMedia(doc, { kind: "image", id }, { isDesign, supportsVideo, exclusive: media?.exclusive }));
    if (media?.exclusive && doc.videoMediaId) toast.show(t("ls.imageReplacesVideo"));
  }
  function setBoardVideo(id: string | null) {
    if (!id) { clearFeaturedMedia(); return; }
    update(selectFeaturedMedia(doc, { kind: "video", id }, { isDesign, supportsVideo, exclusive: media?.exclusive }));
    if (media?.exclusive && doc.imageMediaId) toast.show(t("ls.videoReplaces"));
  }
  function clearFeaturedMedia() {
    update(selectFeaturedMedia(doc, { kind: "none" }, { isDesign, supportsVideo, exclusive: media?.exclusive }));
  }
  function selectSamplePhoto() {
    if (isDesign && design.stock) {
      update(selectFeaturedMedia(doc, { kind: "sample", stockPhoto: design.stock }, { isDesign, supportsVideo }));
    }
  }

  async function upload(file: File | undefined, role: "photo" | "logo" | "item", target?: { si: number; ii: number }) {
    if (!file || preview) return;
    if (!isImageUploadFile(file)) { toast.show(t("tpl.photoType"), true); return; }
    setBusy("upload");
    try {
      const upload = await asUploadImage(file, t);
      const form = new FormData(); form.set("file", upload); form.set("name", upload.name);
      const body = await authToken().then((token) => uploadForm("/api/media", form, token, () => {})) as { id?: string };
      await reloadLibrary();
      if (body.id && role === "item" && target) setItemPhoto(target.si, target.ii, body.id);
      else if (body.id && role === "photo") setBoardPhoto(body.id);
      else if (body.id) patch({ logoMediaId: body.id });
      toast.show(t("tpl.uploaded"));
    } catch (err) {
      toast.show((err as Error).message || t("tpl.uploadFailed"), true);
    } finally {
      setBusy(null);
    }
  }

  /** Same signed upload as the previous layout editor: prepare, upload straight to storage, then register. */
  async function uploadVideo(file: File | undefined) {
    if (!file || preview) return;
    if (file.type && !isVideoUploadFile(file)) { toast.show(t("tpl.videoType"), true); return; }
    const existing = findSameVideo(library, file);
    if (existing) { setBoardVideo(existing.id); toast.show(t("ls.videoInLibrary")); return; }
    setBusy("upload");
    setProgress(t("ed.uploading"));
    try {
      const prepared = await prepareVideo(file);
      const signed = await api<{ mediaId: string; signedUrl: string; token: string }>("/api/media/upload", { method: "POST", body: JSON.stringify({ fileName: file.name, sizeBytes: file.size }) });
      await uploadToSignedUrl(signed.signedUrl, file, (percent) => setProgress(percent >= 99 ? t("ls.processing") : t("ed.uploading")), file.name, signed.token);
      setProgress(t("ls.processing"));
      const completed = await api<{ id?: string; processingStatus?: string }>("/api/media/upload/complete", {
        method: "POST",
        body: JSON.stringify({ mediaId: signed.mediaId, fileName: file.name, durationMs: prepared.durationMs, width: prepared.width, height: prepared.height, thumbnailBase64: await blobToBase64(prepared.thumbnail) }),
      });
      const refreshed = await reloadLibrary();
      if (completed?.processingStatus === "processing") {
        if (!refreshed.some((item) => item.id === signed.mediaId)) {
          setLibrary((prev) => [
            ...prev,
            { id: signed.mediaId, name: file.name, kind: "video", mime: file.type || "video/mp4", url: null, sizeBytes: file.size, thumbnailUrl: null, processingStatus: "processing" },
          ]);
        }
        toast.show(t("up.convertingVideo"));
      } else {
        setBoardVideo(signed.mediaId);
        toast.show(t("ls.uploadComplete"));
      }
    } catch (err) {
      toast.show((err as Error).message || t("tpl.uploadFailed"), true);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function uploadMedia(file: File | undefined) {
    if (!file || preview) return;
    if (isImageUploadFile(file)) return upload(file, "photo");
    if (isVideoUploadFile(file)) {
      if (!supportsVideo) { toast.show(t("tpl.videoNotSupported"), true); return; }
      return uploadVideo(file);
    }
    toast.show(t(supportsVideo ? "tpl.mediaType" : "tpl.photoType"), true);
  }

  async function save(mode: "draft" | "publish", override?: LayoutDocument, displayIds: string[] = []) {
    if (preview) { toast.show(t("tpl.previewOnly")); return null; }
    if (engine === "classic" && classic) return saveClassic(override ?? doc, displayIds);
    const parsed = parseLayout(override ?? doc);
    if (!parsed.ok) { toast.show(parsed.error, true); return null; }
    setBusy(mode);
    try {
      const res = await api<{ menuId: string }>("/api/layout-studio", { method: "POST", body: JSON.stringify(accountSaveBody({ mode, menuId, name, document: parsed.value })) });
      setMenuId(res.menuId);
      setDirty(false);
      onSaved?.();
      return res.menuId;
    } catch (err) {
      toast.show((err as Error).message, true);
      return null;
    } finally {
      setBusy(null);
    }
  }

  /** Classic boards keep their own save: it renders and updates the screens already showing the board. */
  async function saveClassic(working: LayoutDocument, displayIds: string[]) {
    if (!classic) return null;
    const { template, content } = toClassic(working, classic);
    const parsed = parseMenuContent(content);
    if (!parsed.ok) { toast.show(parsed.error, true); return null; }
    setBusy("publish");
    try {
      const body = JSON.stringify({ name, template, content: classicSaveContent(parsed.value), ...(displayIds.length ? { displayIds } : {}) });
      const res = menuId
        ? await api<{ id?: string }>(`/api/menus/${menuId}`, { method: "PATCH", body })
        : await api<{ id?: string }>("/api/menus", { method: "POST", body });
      const id = res.id ?? menuId;
      setMenuId(id);
      setDirty(false);
      onSaved?.();
      return id;
    } catch (err) {
      toast.show((err as Error).message, true);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function publishTo() {
    if (unreadySelectedVideo) {
      toast.show(t("tpl.videoUnreadyBlocked"), true);
      return;
    }
    const ids = Object.keys(picked).filter((k) => picked[k]);
    if (engine === "classic") {
      // One request: save, re-render and put the board on the ticked screens.
      const id = await save("publish", undefined, ids);
      if (!id) return;
      setPublishOpen(false);
      setPublished(true);
      toast.show(ids.length ? t("tpl.publishedOn", { n: ids.length }) : t("tpl.classicSaved"));
      return;
    }
    const id = await save("publish");
    if (!id) return;
    const failed: string[] = [];
    for (const displayId of ids) {
      try { await api("/api/layout-studio/assign", { method: "POST", body: JSON.stringify({ menuId: id, displayId }) }); }
      catch { failed.push(displayId); }
    }
    setPublishOpen(false);
    setPublished(true);
    if (failed.length) toast.show(t("tpl.assignFailed", { n: failed.length }), true);
    else toast.show(ids.length ? t("tpl.publishedOn", { n: ids.length }) : t("tpl.published"));
  }

  const kitApplied = Boolean(brand && doc.primaryColor && doc.primaryColor === brand.primaryColor && doc.accentColor === brand.accentColor);
  function applyKit() {
    if (!brand) return;
    update({
      ...doc,
      primaryColor: brand.primaryColor || null,
      accentColor: brand.accentColor || null,
      ...(brand.logoMediaId && isDesign ? { logoMediaId: brand.logoMediaId } : {}),
    });
  }
  function restoreTemplate() {
    if (!isDesign) { update({ ...doc, primaryColor: null, accentColor: null, textColor: null, backgroundColor: null }); return; }
    update({ ...doc, primaryColor: null, accentColor: null, textColor: null, backgroundColor: null, font: design.look.head, ...(design.look.body !== design.look.head ? { bodyFont: design.look.body } : {}) });
  }

  const n = itemCount(doc);
  const ownerPhotos = hasOwnerItemPhoto(doc);
  const photoTemplate = isDesign && (isPhotoDesign(design) || itemPhotosShown(doc, design));
  // A roomier template that still shows item photos when this one does (shared with the preview API).
  const roomierId = isDesign ? roomierDesignId(doc, design) : null;
  const roomier = isDesign && (fit.dropped > 0 || fit.photosSuppressed) && design.id !== roomierId ? designById(roomierId) : null;
  const merged = engine === "layout" && fit.hiddenSections > 0 ? mergeExtraSections(doc) : null;
  const columns = engine === "layout" ? fixedColumns(doc.template) : null;
  // Schedule templates (Modern Gym) keep each class time in the item's price field: label it "Time".
  const timeFirst = isDesign && design.composition === "timetable";
  const images = library.filter((f) => f.kind === "image");
  const videos = library.filter((f) => f.kind === "video");
  const selectedVideo = selectedVideoOption(library, doc.videoMediaId);
  const selectedVideoFile = doc.videoMediaId ? library.find((f) => f.id === doc.videoMediaId) ?? null : null;
  const unreadySelectedVideo = Boolean(selectedVideoFile && !isReadyMediaStatus(selectedVideoFile.processingStatus));
  const visibleMedia = mediaFilter === "photos" ? images : mediaFilter === "videos" ? videos : library;
  const showSampleCard = Boolean(isDesign && design.stock && mediaFilter !== "videos");
  const sampleSelected = Boolean(isDesign && design.stock && !doc.imageMediaId && !doc.videoMediaId && doc.stockPhoto === design.stock);
  const noMediaSelected = !doc.imageMediaId && !doc.videoMediaId && !(isDesign && doc.stockPhoto);
  const activeVideoId = supportsVideo ? doc.videoMediaId : null;
  const activePhotoId = activeVideoId ? null : doc.imageMediaId;
  const previewVideo = engine === "classic" ? null : videoPreview(doc, library, art.imageHref);
  const regions = useMemo(() => (engine === "classic" || step !== 3 ? [] : boardSvgWithReport(doc).report.regions), [engine, step, doc]);
  const previewHits = engine === "classic" ? [] : step === 3 ? regions.map((region) => {
    const target = region.target;
    const label = target.kind === "featuredMedia" ? t("cz.hitMedia")
      : target.kind === "businessName" ? t("cz.hitBusinessName")
        : target.kind === "featuredText" ? t("cz.hitFeaturedText")
          : target.kind === "sectionHeading" ? t("cz.hitSection", { name: doc.sections[target.sectionIndex]?.name || t("cz.headingUntitled", { n: target.sectionIndex + 1 }) })
            : t("cz.hitItem", { name: doc.sections[target.sectionIndex]?.items[target.itemIndex]?.name || t("tpl.item") });
    return { id: region.id.replace(/[^A-Za-z0-9_-]/g, "-"), box: region.box, label, region: true, target };
  }) : mediaHits(doc).map((hit) => ({
    id: hit.id,
    box: hit.box,
    label: hit.id === "video" ? t("tpl.editVideoArea") : t("tpl.editPhotoArea"),
  }));
  /** Click-to-select in Step 4: open the matching control (no dragging). */
  function selectRegion(id: string) {
    const hit = previewHits.find((h) => h.id === id) as (typeof previewHits)[number] & { target?: (typeof regions)[number]["target"] } | undefined;
    const target = hit?.target;
    if (!target) return;
    let testid = "tpl-cz-media";
    if (target.kind !== "featuredMedia") setCzOpen(true);
    if (target.kind === "businessName" || target.kind === "featuredText") testid = `tpl-cz-role-${target.kind}-size`;
    if (target.kind === "menuItem") testid = "tpl-cz-role-itemName-size";
    if (target.kind === "sectionHeading") { setCzScope(target.sectionIndex); testid = "tpl-cz-heading-override-size"; }
    if (target.kind === "featuredMedia" && !customizationSpec(doc).media) { setCzOpen(true); testid = "tpl-cz-fill"; }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const node = document.querySelector<HTMLElement>(`[data-testid='${testid}']`);
      node?.focus();
      node?.scrollIntoView({ block: "nearest" });
    }));
  }
  function onPreviewHit(id: string) {
    if (step === 3) selectRegion(id);
    else openMediaArea(id);
  }
  function openMediaArea(id: string) {
    void id;
    setStep(2);
    requestAnimationFrame(() => {
      const node = document.querySelector<HTMLElement>("[data-testid='tpl-media-upload']")
        ?? document.querySelector<HTMLElement>("[data-testid='tpl-featured-media']");
      node?.focus();
      node?.scrollIntoView({ block: "nearest" });
    });
  }
  const stepNames = [t("tpl.step.business"), t("tpl.step.menu"), t("tpl.step.content"), t("tpl.step.look")];
  const styleName = engine === "classic" ? t("tpl.classicName") : engine === "layout" ? layoutName(doc.template, t) : design.name[L];

  return (
    <section data-testid="template-editor" data-engine={engine} aria-labelledby="tpl-editor-title">
      <style>{STYLES}</style>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button type="button" className="btn btn-quiet" onClick={onClose}>← {t("tpl.back")}</button>
        <label className="sr-only" htmlFor="tpl-name">{t("tpl.boardName")}</label>
        <input id="tpl-name" className="field font-display font-bold text-lg max-w-xs" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
        <span className={`badge ${published ? "badge-live" : ""}`} data-testid="tpl-status">{published ? t("tpl.statusLive") : dirty ? t("tpl.statusUnsaved") : t("tpl.statusSaved")}</span>
        {unified ? <span className="text-xs text-muted" data-testid="tpl-design-name">{styleName}</span> : null}
        <span className="flex-1" />
        {/* The advanced (layout studio) editor is 16:9 only; vertical boards stay in this editor. */}
        {unified || orientationOf(doc) === "portrait" ? null : (
          <button type="button" className="btn btn-quiet" disabled={busy !== null} onClick={async () => {
            const id = menuId ?? (await save("draft"));
            if (id) onAdvanced(id);
          }}>{t("tpl.advanced")}</button>
        )}
        {engine === "classic" ? null : (
          <button type="button" className="btn btn-quiet" disabled={busy !== null} data-testid="tpl-save-draft"
            onClick={async () => { if (await save("draft")) toast.show(t("tpl.draftSaved")); }}>{busy === "draft" ? t("tpl.saving") : t("ls.saveDraft")}</button>
        )}
        <button type="button" className="btn btn-primary" disabled={busy !== null || unreadySelectedVideo} data-testid="tpl-publish" onClick={() => setPublishOpen(true)}>{engine === "classic" ? t("tpl.classicSave") : t("ls.publish")}</button>
      </div>
      {engine === "classic" ? <p className="text-xs text-muted -mt-2 mb-3" data-testid="tpl-classic-note">{t("tpl.classicNote")}</p> : null}
      {progress ? <p className="text-sm text-muted mb-2" role="status">{progress}</p> : null}
      <h2 id="tpl-editor-title" className="sr-only">{t("tpl.editorTitle")}</h2>
      <div className="tpl-grid">
        <div className={`tpl-preview${orientationOf(doc) === "portrait" ? " is-portrait" : ""}`} data-testid="tpl-preview">
          <p className="text-xs text-muted mb-2 flex justify-between gap-2"><span>{previewVideo ? t("tpl.previewCapVideo") : t("tpl.previewCap")}</span><span data-testid="tpl-canvas-size">{orientationOf(doc) === "portrait" ? "1080 × 1920" : "1920 × 1080"}</span></p>
          <BoardView engine={engine} doc={doc} classic={classic} art={art} brand={brand} className="tpl-tv" label={t("tpl.previewAria", { name })} video={previewVideo} hits={previewHits} onHit={onPreviewHit} />
          {orientationOf(doc) === "portrait" ? (
            <button type="button" className="btn btn-quiet min-h-9 tpl-expand-preview mt-2" data-testid="tpl-expand-preview" onClick={() => setPreviewExpanded(true)}>{t("tpl.expandPreview")}</button>
          ) : null}
          {czOverflow.length ? (
            <div className="note-warn text-sm mt-3 grid gap-2" role="alert" data-testid="tpl-cz-overflow">
              {czOverflow.map((reason) => <p key={reason}>{t(`cz.overflow.${reason}` as MessageKey)}</p>)}
              <p className="text-xs">{t("cz.overflowBody")}</p>
              {czSafe ? (
                <div><button type="button" className="btn btn-quiet min-h-9" data-testid="tpl-cz-safe" onClick={() => { update(applyCustomReset(doc, czSafe)); toast.show(t("cz.safeDone")); }}>{t("cz.safeSize")}</button></div>
              ) : null}
            </div>
          ) : null}
          {fit.photosSuppressed ? (
            <div className="note-warn text-sm mt-3 grid gap-2" role="status" data-testid="tpl-photos-dont-fit">
              <p>{t("tpl.photosDontFit")}</p>
              {roomier ? <div><button type="button" className="btn btn-quiet min-h-9" onClick={() => update(switchDesign(doc, roomier))} data-testid="tpl-roomier">{t("tpl.useRoomier", { name: roomier.name[L] })}</button></div> : null}
            </div>
          ) : null}
          {fit.dropped > 0 ? (
            <div className="note-warn text-sm mt-3 grid gap-2" role="status" data-testid="tpl-dropped">
              <p>{engine === "layout" ? t("tpl.columnsHidden", { n: fit.dropped, cols: columns ?? 0 }) : t(photoTemplate ? "tpl.droppedPhotos" : "tpl.dropped", { n: fit.dropped })}</p>
              <div className="flex flex-wrap gap-2">
                {merged ? <button type="button" className="btn btn-quiet min-h-9" onClick={() => update(merged)} data-testid="tpl-merge">{t("tpl.mergeColumns", { n: columns ?? 0 })}</button> : null}
                {roomier && !fit.photosSuppressed ? <button type="button" className="btn btn-quiet min-h-9" onClick={() => update(switchDesign(doc, roomier))} data-testid="tpl-roomier">{t("tpl.useRoomier", { name: roomier.name[L] })}</button> : null}
                {onSplit ? <button type="button" className="btn btn-quiet min-h-9" onClick={splitOverflow} data-testid="tpl-split">{t("tpl.splitBoard", { n: fit.dropped })}</button> : null}
              </div>
            </div>
          )
            : fit.photosSuppressed ? null
            : fit.scale < 0.72 ? <p className="text-sm mt-3 text-[#7a4a00]" role="status">{t("tpl.tight")}</p>
              : <p className="text-sm mt-3 text-live-ink" role="status">✓ {t(engine !== "classic" && (doc.custom || doc.sections.some((s) => s.headingOverride)) ? "cz.fits" : "tpl.fits")}</p>}
          {fit.clipped.length ? <p className="note-warn text-sm mt-2" role="status" data-testid="tpl-clipped">{t("ls.clippedNames", { names: fit.clipped.map((x) => `“${x}”`).join(", ") })}</p> : null}
        </div>
        <div className="tpl-form card p-4 grid gap-4 min-w-0">
          <nav className="tpl-steps" aria-label={t("tpl.stepsAria")}>
            {stepNames.map((label, i) => (
              <button key={label} type="button" aria-current={step === i ? "step" : undefined} onClick={() => setStep(i as Step)} data-testid={`tpl-step-${i}`}>{i + 1}. {label}</button>
            ))}
          </nav>

          {step === 0 ? (
            <div className="grid gap-3">
              <h3 className="font-display font-bold text-lg">{t("tpl.businessTitle")}</h3>
              <label className="form-label grid gap-1">{t("tpl.businessName")}<input className="field" maxLength={40} value={doc.title} onChange={(e) => patch({ title: e.target.value })} data-testid="tpl-title" /></label>
              <label className="form-label grid gap-1">{t("tpl.tagline")}<input className="field" maxLength={80} value={doc.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} /></label>
              <label className="form-label grid gap-1">{t("tpl.footer")}<input className="field" maxLength={80} value={doc.footer} onChange={(e) => patch({ footer: e.target.value })} /></label>
              <div className="grid gap-2">
                <p className="form-label">{t("tpl.logo")}</p>
                {engine === "design" ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {brand?.logoMediaId ? <button type="button" className="btn btn-quiet" onClick={() => patch({ logoMediaId: brand.logoMediaId })}>{t("tpl.logoFromKit")}</button> : null}
                      <label className="btn btn-quiet cursor-pointer">{t("tpl.uploadLogo")}<input type="file" accept={IMAGE_UPLOAD_ACCEPT} className="sr-only" onChange={(e) => void upload(e.target.files?.[0], "logo")} /></label>
                      {doc.logoMediaId ? <button type="button" className="btn btn-quiet text-danger" onClick={() => patch({ logoMediaId: null })}>{t("tpl.removeLogo")}</button> : null}
                    </div>
                    <p className="text-xs text-muted">{doc.logoMediaId ? t("tpl.logoOn") : t("tpl.logoOff")}</p>
                  </>
                ) : engine === "classic" ? (
                  <p className="text-sm text-muted" data-testid="tpl-logo-classic">{classic?.useBrand && brand?.logoMediaId ? t("tpl.logoClassicOn") : t("tpl.logoClassicOff")}</p>
                ) : (
                  <p className="text-sm text-muted" data-testid="tpl-logo-layout">{t("tpl.logoLayout")}</p>
                )}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-3">
              <div className="flex justify-between items-baseline gap-2"><h3 className="font-display font-bold text-lg">{t("tpl.menuTitle")}</h3><span className="text-xs text-muted">{t("tpl.limits", { n, max: MENU_LIMITS.items, sections: columns ?? MENU_LIMITS.sections })}</span></div>
              {columns ? <p className="text-sm text-muted" data-testid="tpl-columns-note">{t("tpl.columnsNote", { n: columns })}</p> : null}
              {timeFirst ? <p className="text-sm text-muted" data-testid="tpl-time-note">{t("tpl.timeNote")}</p> : null}
              {isDesign && design.composition === "spotlight" ? <p className="text-sm text-muted" data-testid="tpl-spotlight-note">{t("tpl.spotlightNote")}</p> : null}
              {fit.photosSuppressed ? (
                <div className="note-warn text-sm grid gap-2" role="status" data-testid="tpl-photos-dont-fit-menu">
                  <p>{t("tpl.photosDontFit")}</p>
                  {roomier ? <button type="button" className="btn btn-quiet min-h-9 justify-self-start" onClick={() => update(switchDesign(doc, roomier))} data-testid="tpl-roomier-menu">{t("tpl.useRoomier", { name: roomier.name[L] })}</button> : null}
                </div>
              ) : ownerPhotos && !(isDesign && isPhotoDesign(design)) ? (
                <p className="text-sm text-live-ink" role="status" data-testid="tpl-photos-shown">✓ {t("tpl.photosShownNote")}</p>
              ) : <p className="text-xs text-muted">{t("tpl.photoTip")}</p>}
              {doc.sections.map((section, si) => (
                <div className={`tpl-sec ${columns && si >= columns ? "tpl-sec-off" : ""}`} key={si} data-testid={`tpl-section-${si}`}>
                  <div className="tpl-sec-h">
                    {columns ? <span className={`tpl-col ${si >= columns ? "off" : ""}`}>{si < columns ? t("tpl.columnN", { n: si + 1 }) : t("tpl.notShown")}</span> : null}
                    <input className="field font-bold" aria-label={t("tpl.sectionN", { n: si + 1 })} placeholder={t("tpl.section")} maxLength={30} value={section.name}
                      onChange={(e) => setSections((s) => { s[si].name = e.target.value; return s; })} />
                    <button type="button" className="tpl-ib" aria-label={t("tpl.moveSectionUp", { n: si + 1 })} disabled={si === 0} onClick={() => setSections((s) => { [s[si - 1], s[si]] = [s[si], s[si - 1]]; return s; })}>↑</button>
                    <button type="button" className="tpl-ib" aria-label={t("tpl.moveSectionDown", { n: si + 1 })} disabled={si === doc.sections.length - 1} onClick={() => setSections((s) => { [s[si + 1], s[si]] = [s[si], s[si + 1]]; return s; })}>↓</button>
                    <button type="button" className="tpl-ib text-danger" aria-label={t("tpl.removeSection", { n: si + 1 })} onClick={() => setSections((s) => s.filter((_, i) => i !== si))}>✕</button>
                  </div>
                  {section.items.map((item, ii) => (
                    <div className="tpl-item" key={ii}>
                      <button type="button" className="tpl-photo" onClick={() => setPhotoFor({ si, ii })} data-testid={`tpl-photo-${si}-${ii}`}
                        aria-label={item.imageMediaId || item.stockPhoto ? t("tpl.changePhotoFor", { name: item.name || t("tpl.item") }) : t("tpl.addPhotoFor", { name: item.name || t("tpl.item") })}>
                        {item.imageMediaId && urlFor(item.imageMediaId) ? <img src={urlFor(item.imageMediaId)!} alt="" />
                          : item.stockPhoto && isDesign ? <img src={stockPhotoPath(item.stockPhoto)} alt="" />
                            : <span aria-hidden>＋<br />{t("tpl.photo")}</span>}
                      </button>
                      <input className="field" aria-label={t("tpl.itemName", { n: ii + 1 })} placeholder={t("tpl.item")} maxLength={MENU_LIMITS.itemName} value={item.name}
                        onChange={(e) => setSections((s) => { s[si].items[ii].name = e.target.value; return s; })} data-testid={`tpl-item-${si}-${ii}`} />
                      <input className="field text-right" aria-label={timeFirst ? t("tpl.itemTime", { n: ii + 1 }) : t("tpl.itemPrice", { n: ii + 1 })} placeholder={timeFirst ? t("tpl.time") : t("tpl.price")} maxLength={MENU_LIMITS.price} value={item.price}
                        onChange={(e) => setSections((s) => { s[si].items[ii].price = e.target.value; return s; })} />
                      <div className="acts">
                        <button type="button" className="tpl-ib" aria-label={t("tpl.moveItemUp", { n: ii + 1 })} disabled={ii === 0 && si === 0} onClick={() => moveItemAt(si, ii, -1)}>↑</button>
                        <button type="button" className="tpl-ib" aria-label={t("tpl.moveItemDown", { n: ii + 1 })} disabled={ii === section.items.length - 1 && si === doc.sections.length - 1} onClick={() => moveItemAt(si, ii, 1)}>↓</button>
                        <button type="button" className="tpl-ib text-danger" aria-label={t("tpl.removeItem", { n: ii + 1 })} onClick={() => setSections((s) => { s[si].items.splice(ii, 1); return s; })}>✕</button>
                      </div>
                      <input className="field desc" aria-label={t("tpl.itemDesc", { n: ii + 1 })} placeholder={t("tpl.desc")} maxLength={MENU_LIMITS.description} value={item.description}
                        onChange={(e) => setSections((s) => { s[si].items[ii].description = e.target.value; return s; })} />
                    </div>
                  ))}
                  <div className="p-2">
                    <button type="button" className="btn btn-quiet min-h-9" disabled={section.items.length >= MENU_LIMITS.itemsPerSection || n >= MENU_LIMITS.items}
                      onClick={() => setSections((s) => { s[si].items.push(blankItem()); return s; })}>＋ {t("tpl.addItem")}</button>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-quiet justify-self-start" disabled={doc.sections.length >= (columns ?? MENU_LIMITS.sections)}
                onClick={() => setSections((s) => [...s, { name: "", items: [blankItem()] }])}>＋ {columns ? t("tpl.addColumn") : t("tpl.addSection")}</button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-3" data-testid="tpl-step-content">
              <h3 className="font-display font-bold text-lg">{t("tpl.contentTitle")}</h3>
              {unified ? <p className="text-sm text-muted" data-testid="tpl-photos-items">{t("tpl.itemPhotosWhere")}</p> : null}
              {engine === "design" && !designHasMedia(design) ? (
                <div className="grid gap-2">
                  <p className="text-sm text-muted">{t("tpl.noPhotoArea")}</p>
                  {doc.videoMediaId ? <p className="text-sm" data-testid="tpl-video-kept">{t("tpl.videoKeptHidden", { name: selectedVideo?.name || t("tpl.videoUnlisted") })}</p> : null}
                </div>
              ) : (
                <>
                  <div className="grid gap-2.5" data-testid="tpl-featured-media">
                    <div>
                      <h4 className="font-semibold text-base" data-testid="tpl-featured-media-heading">{t("tpl.featuredMedia")}</h4>
                      <p className="text-sm text-muted mt-0.5">{t("tpl.featuredMediaHint")}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className={`btn btn-quiet cursor-pointer ${busy === "upload" ? "pointer-events-none opacity-60" : ""}`} data-testid="tpl-media-upload-label">
                        {busy === "upload" ? t("tpl.uploading") : t("tpl.uploadMedia")}
                        <input
                          type="file"
                          accept={supportsVideo ? `${IMAGE_UPLOAD_ACCEPT},${VIDEO_UPLOAD_ACCEPT}` : IMAGE_UPLOAD_ACCEPT}
                          className="sr-only"
                          disabled={busy !== null}
                          data-testid="tpl-media-upload"
                          onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; void uploadMedia(file); }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-quiet tpl-none-btn"
                        aria-pressed={noMediaSelected}
                        data-testid="tpl-media-none"
                        onClick={clearFeaturedMedia}
                      >
                        {t("tpl.noFeaturedMedia")}
                      </button>
                    </div>
                    <div className="seg justify-self-start" role="group" aria-label={t("tpl.mediaFilterAria")} data-testid="tpl-media-filters">
                      <button type="button" aria-pressed={mediaFilter === "all"} data-testid="tpl-filter-all" onClick={() => setMediaFilter("all")}>{t("tpl.filter.all")}</button>
                      <button type="button" aria-pressed={mediaFilter === "photos"} data-testid="tpl-filter-photos" onClick={() => setMediaFilter("photos")}>{t("tpl.filter.photos")}</button>
                      <button type="button" aria-pressed={mediaFilter === "videos"} data-testid="tpl-filter-videos" onClick={() => setMediaFilter("videos")}>{t("cp.filter.video")}</button>
                    </div>
                    {!supportsVideo && mediaFilter === "videos" ? (
                      <p className="text-xs text-muted" data-testid="tpl-no-video-note">{engine === "classic" ? t("tpl.classicNoVideo") : t("tpl.layoutNoVideo")}</p>
                    ) : null}
                    {unreadySelectedVideo ? (
                      <p className="note-warn text-sm" role="alert" data-testid="tpl-video-unready">{t("tpl.videoUnreadyBlocked")}</p>
                    ) : null}
                    {(visibleMedia.length > 0 || showSampleCard || (activeVideoId && selectedVideo?.missing && mediaFilter !== "photos")) ? (
                      <div className="tpl-media-grid" data-testid="tpl-media-grid">
                        {activeVideoId && selectedVideo?.missing && mediaFilter !== "photos" ? (
                          <button
                            type="button"
                            className="tpl-media-card"
                            aria-pressed={true}
                            aria-label={selectedVideo.name || t("tpl.videoUnlisted")}
                            data-testid="tpl-media-unlisted-video"
                            onClick={() => setBoardVideo(activeVideoId)}
                          >
                            <span className="tpl-media-thumb">
                              <span className="tpl-media-video-empty" aria-hidden="true">▶</span>
                              <span className="tpl-media-badge" data-testid="tpl-card-video-badge">▶ {t("ls.video")}</span>
                              <span className="tpl-media-check" aria-hidden="true">✓</span>
                            </span>
                            <span className="tpl-media-meta">
                              <span className="tpl-media-name">{selectedVideo.name || t("tpl.videoUnlisted")}</span>
                            </span>
                          </button>
                        ) : null}
                        {visibleMedia.map((f) => {
                          const isVideo = f.kind === "video";
                          const isProcessing = isProcessingMediaStatus(f.processingStatus);
                          const isFailed = f.processingStatus === "failed";
                          const isUnready = !isReadyMediaStatus(f.processingStatus);
                          const disabled = isUnready || (isVideo && !supportsVideo);
                          const isSelected = isVideo ? activeVideoId === f.id : activePhotoId === f.id;
                          const thumbSrc = isVideo ? f.thumbnailUrl : f.url;
                          return (
                            <button
                              key={f.id}
                              type="button"
                              className="tpl-media-card"
                              aria-pressed={isSelected}
                              aria-label={f.name}
                              disabled={disabled}
                              data-testid={`tpl-media-card-${f.id}`}
                              data-media-kind={f.kind}
                              onClick={() => (isVideo ? setBoardVideo(f.id) : setBoardPhoto(f.id))}
                            >
                              <span className="tpl-media-thumb">
                                {thumbSrc ? (
                                  <img src={thumbSrc} alt="" />
                                ) : isVideo ? (
                                  <span className="tpl-media-video-empty" aria-hidden="true">▶</span>
                                ) : null}
                                {isVideo ? (
                                  <span className="tpl-media-badge" data-testid="tpl-card-video-badge">▶ {t("ls.video")}</span>
                                ) : null}
                                {isSelected ? <span className="tpl-media-check" aria-hidden="true">✓</span> : null}
                              </span>
                              <span className="tpl-media-meta">
                                <span className="tpl-media-name" title={f.name}>{f.name}</span>
                                {isProcessing ? (
                                  <span className="tpl-media-status is-processing" data-testid="tpl-card-processing">{t("ml.processing")}</span>
                                ) : isFailed ? (
                                  <span className="tpl-media-status is-failed" data-testid="tpl-card-failed">{t("ml.failed")}</span>
                                ) : null}
                              </span>
                            </button>
                          );
                        })}
                        {showSampleCard && design.stock ? (
                          <button
                            type="button"
                            className="tpl-media-card"
                            aria-pressed={sampleSelected}
                            aria-label={t("tpl.samplePhoto")}
                            data-testid="tpl-media-sample"
                            onClick={selectSamplePhoto}
                          >
                            <span className="tpl-media-thumb">
                              <img src={stockPhotoPath(design.stock)} alt="" />
                              {sampleSelected ? <span className="tpl-media-check" aria-hidden="true">✓</span> : null}
                            </span>
                            <span className="tpl-media-meta">
                              <span className="tpl-media-name">{t("tpl.samplePhoto")}</span>
                            </span>
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted" data-testid="tpl-media-empty">
                        {mediaFilter === "photos" ? t("tpl.noMedia") : mediaFilter === "videos" ? t("tpl.emptyVideos") : t("tpl.emptyAllMedia")}
                      </p>
                    )}
                    {!supportsVideo && mediaFilter !== "videos" ? (
                      <p className="text-xs text-muted">{engine === "classic" ? t("tpl.classicNoVideo") : t("tpl.layoutNoVideo")}</p>
                    ) : null}
                  </div>
                  {unified && engine !== "classic" && doc.imageMediaId && !activeVideoId ? (
                    <details className="tpl-adv" data-testid="tpl-photo-advanced">
                      <summary>{t("tpl.advancedOptions")}</summary>
                      <div className="grid gap-2 pt-2">
                        <div className="seg" role="group" aria-label={t("ls.howFits")}>
                          <button type="button" aria-pressed={doc.imageFit !== "contain"} onClick={() => patch({ imageFit: "cover" })}>{t("ls.fill")}</button>
                          <button type="button" aria-pressed={doc.imageFit === "contain"} onClick={() => patch({ imageFit: "contain" })}>{t("ls.fit")}</button>
                        </div>
                        <p className="text-xs text-muted">{t("ls.fillFitNote")}</p>
                        <label className="form-label grid gap-1">{t("ls.position")}
                          <select className="field" aria-label={t("ls.photoPosition")} value={doc.imageAnchor} onChange={(e) => patch({ imageAnchor: e.target.value as LayoutDocument["imageAnchor"] })}>
                            {(["center", "top", "bottom", "left", "right"] as const).map((a) => <option key={a} value={a}>{t(`ls.${a}` as MessageKey)}</option>)}
                          </select>
                        </label>
                      </div>
                    </details>
                  ) : null}
                  {engine === "classic" || (engine === "layout" && !media?.featureText) ? null : (
                    <div className="grid gap-3 pt-3 border-t border-line" data-testid="tpl-featured-text">
                      <h4 className="font-semibold">{t("tpl.featureTitle")}</h4>
                      <label className="form-label grid gap-1">{t("tpl.featureHead")}<input className="field" maxLength={40} value={doc.featureTitle} onChange={(e) => patch({ featureTitle: e.target.value })} data-testid="tpl-feature-head" /></label>
                      <label className="form-label grid gap-1">{t("tpl.featureDetail")}<input className="field" maxLength={80} value={doc.featureDetail} onChange={(e) => patch({ featureDetail: e.target.value })} data-testid="tpl-feature-detail" /></label>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-4">
              <h3 className="font-display font-bold text-lg">{t("tpl.lookTitle")}</h3>
              <div className="grid gap-2" data-testid="tpl-orientation">
                <p className="form-label" id="tpl-orient-label">{t("tpl.orientation")}</p>
                <div className="tpl-orient" role="group" aria-labelledby="tpl-orient-label">
                  {(["landscape", "portrait"] as const).map((value) => (
                    <button key={value} type="button" className="tpl-var" aria-pressed={orientationOf(doc) === value} data-testid={`tpl-orientation-${value}`}
                      onClick={() => setOrientation(value)}>
                      <span className="tpl-orient-shape" aria-hidden style={value === "portrait" ? { width: 14, height: 24 } : { width: 26, height: 15 }} />
                      <span>{t(value === "portrait" ? "tpl.orientationVertical" : "tpl.orientationHorizontal")}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted">{t("tpl.orientationHelp")}</p>
              </div>
              {fit.photosSuppressed ? (
                <div className="note-warn text-sm grid gap-2" role="status" data-testid="tpl-photos-dont-fit-look">
                  <p>{t("tpl.photosDontFit")}</p>
                  {roomier ? <button type="button" className="btn btn-quiet min-h-9 justify-self-start" onClick={() => update(switchDesign(doc, roomier))} data-testid="tpl-roomier-look">{t("tpl.useRoomier", { name: roomier.name[L] })}</button> : null}
                </div>
              ) : null}
              {engine === "design" ? (
                <div className="grid gap-2">
                  <p className="form-label">{t("tpl.colourStyle")}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {design.variants.map((v) => (
                      <button key={v.id} type="button" className="tpl-var" aria-pressed={(doc.variant ?? design.variants[0].id) === v.id} onClick={() => patch({ variant: v.id })}>
                        <span className="tpl-sw" aria-hidden><span style={{ background: v.paper }} /><span style={{ background: v.accent }} /><span style={{ background: v.panel }} /></span>{v.name[L]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid gap-2" data-testid="tpl-palette">
                  <p className="form-label">{t("tpl.colourStyle")}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {CLASSIC_THEMES.map((theme) => {
                      const on = engine === "classic" ? classic?.theme === theme.id : doc.palette === theme.id;
                      return (
                        <button key={theme.id} type="button" className="tpl-var" aria-pressed={on} onClick={() => (engine === "classic" ? patchClassic({ theme: theme.id }) : patch({ palette: theme.id }))}>
                          <span className="tpl-sw" aria-hidden>{theme.swatch.map((c) => <span key={c} style={{ background: c }} />)}</span>{t(`tpl.theme.${theme.id}` as MessageKey)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {engine === "classic" ? (
                <div className="grid gap-2" data-testid="tpl-cz-classic">
                  <p className="form-label">{t("cz.classicTitle")}</p>
                  <p className="text-xs text-muted">{t("cz.classicBody")}</p>
                  {onNewBoard ? <button type="button" className="btn btn-quiet justify-self-start" onClick={() => onNewBoard(doc, `${name} (2)`)} data-testid="tpl-cz-classic-copy">{t("cz.classicCopy")}</button> : null}
                </div>
              ) : (
                <CustomizeLook doc={doc} update={update} open={czOpen} onOpen={setCzOpen} scope={czScope} onScope={setCzScope}
                  hasPhoto={Boolean(art.imageHref || (isDesign && doc.stockPhoto && designHasMedia(design)) || (engine === "layout" && doc.imageMediaId))} />
              )}
              {engine === "classic" ? (
                <div className="grid gap-2" data-testid="tpl-classic-switch">
                  <p className="form-label">{t("tpl.switchTitle")}</p>
                  <p className="text-xs text-muted">{t("tpl.classicSwitchBody")}</p>
                  {onNewBoard ? <button type="button" className="btn btn-quiet justify-self-start" onClick={() => onNewBoard(doc, `${name} (2)`)} data-testid="tpl-new-from-classic">{t("tpl.classicSwitch")}</button> : null}
                </div>
              ) : (
                <div className="grid gap-2">
                  <p className="form-label">{t("tpl.switchTitle")}</p>
                  <p className="text-xs text-muted">{t("tpl.switchBody")}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto pr-1" role="group" aria-label={t("tpl.switchTitle")}>
                    {MENU_DESIGNS.map((d) => (
                      <SwitchCard key={d.id} design={d} current={doc} art={art} label={d.name[L]} onPick={() => update(switchDesign(doc, d))} />
                    ))}
                    {unified ? ORIGINAL_LAYOUTS.map((layout) => (
                      <LayoutSwitchCard key={layout.id} template={layout.template} current={doc} art={art} label={layoutName(layout.template, t)} onPick={() => update(switchToLayout(doc, layout.template))} />
                    )) : null}
                  </div>
                </div>
              )}
              <div className="grid gap-2">
                <p className="form-label">{t("tpl.kitTitle")}</p>
                {engine === "classic" ? (
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-line min-h-11" data-testid="tpl-classic-kit">
                    <input type="checkbox" className="size-5" checked={Boolean(classic?.useBrand)} onChange={(e) => patchClassic({ useBrand: e.target.checked })} />
                    <span className="text-sm flex-1">{brand?.custom ? t("tpl.classicKit") : t("tpl.noKit")}</span>
                  </label>
                ) : brand && brand.custom ? (
                  <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-line">
                    <span className="size-6 rounded-md" style={{ background: brand.primaryColor }} aria-hidden />
                    <span className="size-6 rounded-md" style={{ background: brand.accentColor }} aria-hidden />
                    <span className="text-sm flex-1 min-w-[8rem]">{kitApplied ? t("tpl.kitOn") : t("tpl.kitOff")}</span>
                    {kitApplied ? <button type="button" className="btn btn-quiet" onClick={restoreTemplate} data-testid="tpl-restore">{isDesign ? t("tpl.restore") : t("ls.builtIn")}</button>
                      : <button type="button" className="btn btn-primary" onClick={applyKit} data-testid="tpl-apply-kit">{t("tpl.applyKit")}</button>}
                  </div>
                ) : <p className="text-sm text-muted">{t("tpl.noKit")}</p>}
                {engine !== "classic" && !kitApplied && (doc.primaryColor || doc.accentColor || doc.textColor || doc.backgroundColor) ? (
                  <button type="button" className="btn btn-quiet justify-self-start" onClick={restoreTemplate}>{isDesign ? t("tpl.restore") : t("ls.builtIn")}</button>
                ) : null}
                {engine !== "classic" ? <p className="text-xs text-muted">{t("tpl.kitNote")}</p> : null}
              </div>
              {isDesign ? (
                <div className="grid gap-2">
                  <p className="form-label">{t("tpl.checks")}</p>
                  <ul className="grid gap-1.5" data-testid="tpl-checks">
                    {colors.checks.map((c) => (
                      <li key={c.key} className={`tpl-ck ${c.adjusted ? "adj" : ""}`}>
                        <span>{t(`tpl.check.${c.key}` as MessageKey)}</span>
                        <span>{c.ratio.toFixed(1)}:1 · {c.adjusted ? t("tpl.adjusted") : `✓ ${t("tpl.ok")}`}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {unified ? <AdvancedLook engine={engine} doc={doc} patch={patch} /> : null}
            </div>
          ) : null}

          <div className="flex justify-between gap-2 pt-2 border-t border-line">
            <button type="button" className="btn btn-quiet" disabled={step === 0} onClick={() => setStep((step - 1) as Step)}>← {step > 0 ? stepNames[step - 1] : ""}</button>
            {step < 3 ? <button type="button" className="btn btn-primary" onClick={() => setStep((step + 1) as Step)}>{stepNames[step + 1]} →</button>
              : <button type="button" className="btn btn-primary" disabled={busy !== null || unreadySelectedVideo} onClick={() => setPublishOpen(true)}>{engine === "classic" ? t("tpl.classicSave") : t("ls.publish")} →</button>}
          </div>
        </div>
      </div>

      {previewExpanded && orientationOf(doc) === "portrait" ? (
        <Dialog label={t("tpl.previewAria", { name })} onClose={() => setPreviewExpanded(false)} variant="center" tone="dark" testId="tpl-preview-overlay" className="tpl-preview-overlay">
          <div className="tpl-preview-overlay-inner">
            <button type="button" className="btn btn-quiet bg-white min-h-10" data-testid="tpl-preview-close" onClick={() => setPreviewExpanded(false)}>{t("tpl.closePreview")}</button>
            <BoardView engine={engine} doc={doc} classic={classic} art={art} brand={brand} className="tpl-tv" label={t("tpl.previewAria", { name })} video={previewVideo} />
          </div>
        </Dialog>
      ) : null}

      {publishOpen ? (
        <Dialog label={t("tpl.publishTitle")} onClose={() => setPublishOpen(false)} className="bg-paper w-full max-w-lg rounded-2xl p-5" variant="center">
          <div className="grid gap-3" data-testid="tpl-publish-dialog">
            <h3 className="font-display font-bold text-lg">{t("tpl.publishTitle")}</h3>
            {fit.dropped > 0 ? <p className="note-warn text-sm" role="alert" data-testid="tpl-publish-blocked">{t("tpl.publishBlocked", { n: fit.dropped })}</p> : null}
            {czOverflow.length ? (
              <div className="note-warn text-sm grid gap-2" role="alert" data-testid="tpl-publish-cz-blocked">
                <p>{t("cz.publishBlocked")}</p>
                {czSafe ? <div><button type="button" className="btn btn-quiet min-h-9" onClick={() => { update(applyCustomReset(doc, czSafe)); toast.show(t("cz.safeDone")); }}>{t("cz.safeSize")}</button></div> : null}
              </div>
            ) : null}
            {unreadySelectedVideo ? <p className="note-warn text-sm" role="alert" data-testid="tpl-publish-video-blocked">{t("tpl.videoUnreadyBlocked")}</p> : null}
            <p className="text-sm text-muted">{engine === "classic" ? t("tpl.classicPublishBody") : t("tpl.publishBody")}</p>
            {displays === null ? <p className="text-sm text-muted">{t("common.loading")}</p> : displays.length === 0 ? <p className="text-sm text-muted">{t("tpl.noScreens")}</p> : (
              <ul className="grid gap-2">
                {displays.map((d) => (
                  <li key={d.id}>
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-line min-h-11">
                      <input type="checkbox" className="size-5" checked={!!picked[d.id]} onChange={(e) => setPicked({ ...picked, [d.id]: e.target.checked })} />
                      <span className="flex-1 min-w-0"><span className="font-semibold block break-words">{d.name}</span>
                        {(d.orientation === "portrait") !== (orientationOf(doc) === "portrait") ? (
                          <span className="block text-xs text-muted" data-testid="tpl-publish-mismatch">{t(orientationOf(doc) === "portrait" ? "tpl.mismatchVerticalOnHorizontal" : "tpl.mismatchHorizontalOnVertical")}</span>
                        ) : null}
                      </span>
                      <span className={`badge ${d.online ? "badge-live" : ""}`}>{d.online ? t("tpl.online") : t("tpl.offline")}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">{t("tpl.publishNote")}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-quiet" onClick={() => setPublishOpen(false)}>{t("tpl.cancel")}</button>
              <button type="button" className="btn btn-primary" disabled={busy !== null || fit.dropped > 0 || czOverflow.length > 0} onClick={() => void publishTo()} data-testid="tpl-publish-confirm">
                {busy === "publish" ? t("tpl.publishing") : engine === "classic" && !Object.values(picked).some(Boolean) ? t("tpl.classicSave") : t("tpl.publishN", { n: Object.values(picked).filter(Boolean).length })}
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}

      {photoFor && doc.sections[photoFor.si]?.items[photoFor.ii] ? (() => {
        const item = doc.sections[photoFor.si].items[photoFor.ii];
        const label = item.name || t("tpl.item");
        const images = library.filter((f) => f.kind === "image");
        const current = item.imageMediaId ? urlFor(item.imageMediaId) : item.stockPhoto && isDesign ? stockPhotoPath(item.stockPhoto) : null;
        return (
          <Dialog label={t("tpl.photoFor", { name: label })} onClose={() => setPhotoFor(null)} className="bg-paper w-full max-w-xl rounded-2xl p-5 max-h-[85dvh] overflow-y-auto" variant="center">
            <div className="grid gap-3" data-testid="tpl-item-photo-dialog">
              <h3 className="font-display font-bold text-lg break-words">{t("tpl.photoFor", { name: label })}</h3>
              {unified && current ? <img src={current} alt={t("tpl.currentPhoto", { name: label })} className="w-28 h-28 rounded-xl object-cover border border-line" data-testid="tpl-item-current" /> : null}
              <p className="text-sm text-muted">{t("tpl.photoForBody")}</p>
              <div className="flex flex-wrap gap-2">
                <label className="btn btn-primary cursor-pointer">{busy === "upload" ? t("tpl.uploading") : unified && current ? t("tpl.replacePhoto") : t("tpl.uploadPhoto")}
                  <input type="file" accept={IMAGE_UPLOAD_ACCEPT} className="sr-only" data-testid="tpl-item-upload"
                    onChange={(e) => { const target = photoFor; void upload(e.target.files?.[0], "item", target).then(() => setPhotoFor(null)); }} />
                </label>
                {item.imageMediaId || item.stockPhoto ? <button type="button" className="btn btn-quiet text-danger" data-testid="tpl-item-remove" onClick={() => { setItemPhoto(photoFor.si, photoFor.ii, null); setPhotoFor(null); }}>{t("tpl.removePhoto")}</button> : null}
              </div>
              <p className="form-label">{t("tpl.fromMedia")}</p>
              {images.length ? (
                <div className="tpl-lib">{images.map((f) => (
                  <button key={f.id} type="button" aria-pressed={item.imageMediaId === f.id} aria-label={f.name}
                    onClick={() => { setItemPhoto(photoFor.si, photoFor.ii, f.id); setPhotoFor(null); }}>{f.url ? <img src={f.url} alt="" /> : null}</button>
                ))}</div>
              ) : <p className="text-sm text-muted">{t("tpl.noMedia")}</p>}
              <p className="text-xs text-muted" data-testid="tpl-dialog-where">{isDesign && isPhotoDesign(design) ? t("tpl.photoWhereCards") : t("tpl.photoWhereThumbs", { name: label })}</p>
              <div className="flex justify-end"><button type="button" className="btn btn-quiet" onClick={() => setPhotoFor(null)}>{t("tpl.done")}</button></div>
            </div>
          </Dialog>
        );
      })() : null}
    </section>
  );
}

const CLASSIC_THEMES: { id: "classic" | "fresh" | "bold"; swatch: string[] }[] = [
  { id: "classic", swatch: ["#0b1220", "#4d94ff", "#13203a"] },
  { id: "fresh", swatch: ["#f6f9fe", "#0066ff", "#ffffff"] },
  { id: "bold", swatch: ["#0066ff", "#ffd34d", "#0047b3"] },
];

function layoutName(template: LayoutTemplate, t: ReturnType<typeof useLocale>["t"]) {
  const id = ORIGINAL_LAYOUTS.find((layout) => layout.template === template)?.id ?? "menu-promo";
  return t(`lo.${id}.name` as MessageKey);
}

/** Everything the previous layout editor could set that isn't a first-step choice, behind one disclosure. */
function AdvancedLook({ engine, doc, patch }: { engine: Engine; doc: LayoutDocument; patch: (p: Partial<LayoutDocument>) => void }) {
  const { t } = useLocale();
  // Classic menus keep the six faces their save path and the Android app accept; template/layout boards offer every face.
  const lookFonts = engine === "classic" ? BOARD_FONTS.filter((font) => isClassicFont(font.id)) : BOARD_FONTS;
  // The menu/photo proportion is the Step 4 Basic "Featured photo size" slider now (custom.mediaSize, synced to split).
  const columnWidths = engine === "layout" && (doc.template === "triple-column" || doc.template === "two-menu-promo");
  const widths: [number, number, number] = doc.columnWidths ?? (doc.template === "two-menu-promo" ? [0.35, 0.35, 0.3] : [doc.split, (1 - doc.split) / 2, (1 - doc.split) / 2]);
  function setWidth(index: number, value: number) {
    const next: [number, number, number] = [...widths];
    next[index] = Math.min(0.6, Math.max(0.2, value));
    const others = [0, 1, 2].filter((i) => i !== index);
    const remain = 1 - next[index];
    const sum = next[others[0]] + next[others[1]] || 1;
    next[others[0]] = Math.min(0.6, Math.max(0.2, (remain * next[others[0]]) / sum));
    next[others[1]] = remain - next[others[0]];
    if (next[others[1]] < 0.2 || next[others[1]] > 0.6) return;
    patch({ columnWidths: next });
  }
  return (
    <details className="tpl-adv" data-testid="tpl-advanced">
      <summary>{t("tpl.advancedOptions")}</summary>
      <div className="grid gap-3 pt-3">
        <p className="text-xs text-muted">{t("tpl.advancedNote")}</p>
        {engine !== "classic" ? (
          <div className="grid grid-cols-2 gap-2">
            <ColorField label={t("ls.textColor")} ariaLabel={t("ls.textColor")} value={doc.textColor} fallback="#0b1220" onChange={(next) => patch({ textColor: next })} />
            <ColorField label={t("ls.menuBg")} ariaLabel={t("ls.menuBg")} value={doc.backgroundColor} fallback="#f6f9fe" onChange={(next) => patch({ backgroundColor: next })} />
            <ColorField label={t("ls.featureColor")} ariaLabel={t("ls.primaryColor")} value={doc.primaryColor} fallback="#0066ff" onChange={(next) => patch({ primaryColor: next })} />
            <ColorField label={t("ls.accentColor")} ariaLabel={t("ls.accentColor")} value={doc.accentColor} fallback="#ffd34d" onChange={(next) => patch({ accentColor: next })} />
          </div>
        ) : null}
        <label className="form-label grid gap-1">{t("ls.font")}
          <select className="field" value={doc.font} data-testid="tpl-font" onChange={(e) => {
            const next = e.target.value;
            if (!isBoardFont(next) || (engine === "classic" && !isClassicFont(next))) return;
            const { bodyFont, ...rest } = doc;
            patch(bodyFont && bodyFont !== next ? { ...rest, font: next, bodyFont } : { ...rest, font: next, bodyFont: undefined });
          }}>
            {lookFonts.map((font) => <option key={font.id} value={font.id}>{font.label} · {t(`font.${font.id}.hint` as MessageKey)}</option>)}
          </select>
        </label>
        <label className="form-label grid gap-1">{t("studio.bodyFont")}
          <select className="field" value={doc.bodyFont ?? ""} data-testid="tpl-body-font" onChange={(e) => {
            const next = e.target.value;
            patch({ bodyFont: isBoardFont(next) && next !== doc.font && (engine !== "classic" || isClassicFont(next)) ? next : undefined });
          }}>
            <option value="">{t("studio.bodyFontSame")}</option>
            {lookFonts.filter((font) => font.id !== doc.font).map((font) => <option key={font.id} value={font.id}>{font.label} · {t(`font.${font.id}.hint` as MessageKey)}</option>)}
          </select>
        </label>
        {engine === "layout" ? (
          <div className="grid gap-1">
            <p className="form-label">{t("ls.typeSize")}</p>
            <div className="seg" role="group" aria-label={t("ls.typeSize")}>
              <button type="button" aria-pressed={doc.typeScale === "room"} onClick={() => patch({ typeScale: "room" })}>{t("ls.room")}</button>
              <button type="button" aria-pressed={doc.typeScale === "counter"} onClick={() => patch({ typeScale: "counter" })}>{t("ls.counter")}</button>
            </div>
            <p className="text-xs text-muted">{t("ls.roomNote")}</p>
          </div>
        ) : null}
        {columnWidths ? (
          <fieldset className="grid gap-1 border border-line rounded-xl p-3" data-testid="tpl-column-widths">
            <legend className="form-label px-1">{t("ls.columnWidths")}</legend>
            {widths.map((w, i) => (
              <label key={i} className="text-sm grid gap-1">{t("ls.columnN", { n: i + 1 })} {Math.round(w * 100)}%
                <input aria-label={t("ls.columnWidthN", { n: i + 1 })} type="range" min={0.2} max={0.6} step={0.01} value={w} onChange={(e) => setWidth(i, Number(e.target.value))} />
              </label>
            ))}
            <p className="text-xs text-muted">{t("ls.columnsNote")}</p>
          </fieldset>
        ) : null}
      </div>
    </details>
  );
}

function SwitchCard({ design, current, art, label, onPick }: { design: MenuDesign; current: LayoutDocument; art: Art; label: string; onPick: () => void }) {
  const doc = useMemo(() => switchDesign(current, design), [current, design]);
  const active = current.design === design.id;
  return (
    <button type="button" className="tpl-var" aria-pressed={active} onClick={onPick} data-testid={`tpl-switch-${design.id}`}>
      <DesignBoard doc={doc} art={{ imageHref: art.imageHref, logoHref: art.logoHref }} className="rounded-md" />
      {label}
    </button>
  );
}

function LayoutSwitchCard({ template, current, art, label, onPick }: { template: LayoutTemplate; current: LayoutDocument; art: Art; label: string; onPick: () => void }) {
  const doc = useMemo(() => switchToLayout(current, template), [current, template]);
  const active = !current.design && current.template === template;
  return (
    <button type="button" className="tpl-var" aria-pressed={active} onClick={onPick} data-testid={`tpl-switch-layout-${template}`}>
      <BoardView engine="layout" doc={doc} classic={null} art={{ imageHref: art.imageHref, logoHref: null, itemImages: art.itemImages }} brand={null} className="rounded-md" />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ one gallery ------------------------------------------------------------------ */

const STRUCTURES: (Structure | "all")[] = ["all", "single", "columns", "media", "cards"];

/**
 * The unified design gallery (UNIFIED_MENU_EDITOR): premium templates, the original layouts and the classic
 * full-screen menu in one place. Every choice opens the same menu designer.
 */
/** One gallery filter row: its label in the shared label column, then a segmented control (plus optional extras). */
function FilterRow({ id, label, children, extra }: { id: string; label: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <>
      <span className="tpl-filter-label" id={id}>{label}</span>
      <div className="tpl-filter-controls">
        <div className="seg" role="group" aria-labelledby={id}>{children}</div>
        {extra}
      </div>
    </>
  );
}

/** "Start from scratch": one card in the gallery grid, same size and structure as a template card, dashed to mark it as blank. */
function ScratchCard({ onPick }: { onPick: () => void }) {
  const t = useT();
  return (
    <li className="min-w-0 flex">
      <button type="button" className="tpl-card is-scratch w-full" data-testid="template-scratch" onClick={onPick}>
        <span className="tpl-blank" aria-hidden>＋</span>
        <span className="font-display font-bold text-[15px]">{t("tpl.scratch")}</span>
        <span className="text-sm text-muted tpl-card-desc">{t("tpl.scratchBody")}</span>
        <span className="btn btn-quiet min-h-10 tpl-card-cta" aria-hidden>{t("tpl.scratchCta")}</span>
      </button>
    </li>
  );
}

export function DesignGallery({ onPick, onCancel, brand }: {
  onPick: (pick: { document: LayoutDocument; name: string; classic: ClassicSettings | null }) => void;
  onCancel: () => void;
  brand: Brand | null;
}) {
  const { locale, t } = useLocale();
  const L = locale === "es" ? "es" : "en";
  const [business, setBusiness] = useState<DesignBusiness | "all">("all");
  const [style, setStyle] = useState<DesignStyle | "all">("all");
  const [structure, setStructure] = useState<Structure | "all">("all");
  const [photos, setPhotos] = useState(false);
  const entries = useMemo(() => galleryEntries(), []);
  const shown = filterGallery(entries, { business, style, photos, structure });
  const noArt: Art = { imageHref: null, logoHref: null };
  const classicSample = useMemo(() => fromClassic("classic", sampleMenu()), []);

  function pick(entry: GalleryEntry) {
    if (entry.kind === "design") { onPick({ document: designDocument(entry.design), name: entry.design.name[L], classic: null }); return; }
    if (entry.kind === "layout") { onPick({ document: newLayoutDocument(entry.template, brand), name: t(`lo.${entry.id}.name` as MessageKey), classic: null }); return; }
    const seeded = fromClassic("classic", seedClassicMenu(sampleMenu(), brand));
    onPick({ document: seeded.doc, name: t("lo.full-screen.name"), classic: seeded.classic });
  }
  const nameOf = (entry: GalleryEntry) => (entry.kind === "design" ? entry.design.name[L] : t(`lo.${entry.id}.name` as MessageKey));
  const blurbOf = (entry: GalleryEntry) => (entry.kind === "design" ? entry.design.blurb[L] : t(`lo.${entry.id}.blurb` as MessageKey));

  return (
    <section className="mb-6" data-testid="design-gallery" aria-labelledby="tpl-gallery-title">
      <style>{STYLES}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="tpl-gallery-title" className="font-display text-2xl font-bold">{t("tpl.unifiedTitle")}</h2>
          <p className="text-sm text-muted mt-1">{t("tpl.unifiedLede")}</p>
        </div>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>{t("tpl.cancel")}</button>
      </div>
      <div className="tpl-filters mt-4" data-testid="gallery-filters">
        <FilterRow id="tpl-f-business" label={t("tpl.filterBusiness")}>
          {BUSINESSES.map((id) => (
            <button key={id} type="button" aria-pressed={business === id} onClick={() => setBusiness(id)}>{t(`tpl.business.${id}` as MessageKey)}</button>
          ))}
        </FilterRow>
        <FilterRow id="tpl-f-style" label={t("tpl.filterStyle")}>
          {STYLE_IDS.map((id) => (
            <button key={id} type="button" aria-pressed={style === id} onClick={() => setStyle(id)}>{t(`tpl.style.${id}` as MessageKey)}</button>
          ))}
        </FilterRow>
        <FilterRow id="tpl-f-structure" label={t("tpl.filterStructure")}
          extra={(
            // An on/off filter that combines with any layout, so it sits apart from the layout choices.
            <div className="seg">
              <button type="button" aria-pressed={photos} onClick={() => setPhotos(!photos)} data-testid="filter-photos"><IconImage />{t("tpl.filterPhotos")}</button>
            </div>
          )}>
          {STRUCTURES.map((id) => (
            <button key={id} type="button" aria-pressed={structure === id} onClick={() => setStructure(id)} data-testid={`filter-structure-${id}`}>{t(`tpl.structure.${id}` as MessageKey)}</button>
          ))}
        </FilterRow>
      </div>
      <p className="sr-only" role="status">{t("tpl.count", { n: shown.length })}</p>
      <ul className="grid gap-4 mt-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("tpl.galleryTitle")}>
        {shown.map((entry) => (
          <li key={`${entry.kind}-${entry.id}`} className="min-w-0 flex">
            <button type="button" className="tpl-card w-full" data-testid={entry.kind === "design" ? `template-${entry.id}` : `layout-${entry.id}`} onClick={() => pick(entry)}>
              {entry.kind === "design" ? <DesignBoard doc={designDocument(entry.design)} art={noArt} />
                : entry.kind === "layout" ? <BoardView engine="layout" doc={sampleLayout(entry.template)} classic={null} art={noArt} brand={null} />
                  : <BoardView engine="classic" doc={classicSample.doc} classic={classicSample.classic} art={noArt} brand={null} />}
              <span className="font-display font-bold text-[15px]">{nameOf(entry)}</span>
              <span className="text-sm text-muted tpl-card-desc">{blurbOf(entry)}</span>
              <span className="flex flex-wrap gap-1.5">
                <span className="tpl-tag">{entry.business === "any" ? t("tpl.business.any") : t(`tpl.business.${entry.business}` as MessageKey)}</span>
                <span className="tpl-tag">{t(`tpl.structure.${entry.structure}` as MessageKey)}</span>
                {entry.kind === "design" ? <span className="tpl-tag">{t("tpl.colourStyles", { n: entry.design.variants.length })}</span> : <span className="tpl-tag">{t("tpl.colourStyles", { n: 3 })}</span>}
                {entry.photos ? <span className="tpl-tag">{t("tpl.itemPhotosTag")}</span> : <span className="tpl-tag">{t("tpl.itemThumbsTag")}</span>}
                {entry.original ? <span className="tpl-tag">{t("tpl.originalTag")}</span> : null}
              </span>
              <span className="btn btn-primary min-h-10 tpl-card-cta" aria-hidden>{t("tpl.use")}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 ? <li className="text-sm text-muted">{t("tpl.noMatch")}</li> : null}
        <ScratchCard onPick={() => onPick({ document: scratchDocument(), name: "", classic: null })} />
      </ul>
    </section>
  );
}

export { stockPhotoPath };
