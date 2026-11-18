"use client";
/**
 * Premium menu templates: the gallery shown by "New menu board" and the guided editor
 * (Business → Menu → Photos → Look). Behind the MENU_TEMPLATES rollout flag (lib/menu-templates-flag.ts).
 *
 * The preview is the exact SVG the server turns into the TV image (lib/menu-design-svg.ts), so what the owner sees
 * here is what the screen shows. Saving reuses POST /api/layout-studio (draft never moves a screen; publish swaps
 * the image on the screens already showing the board) and POST /api/layout-studio/assign for new screens.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { api, authToken, uploadForm, useApi, type DisplayItem } from "@/lib/api";
import { useLocale } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/en";
import { Dialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { useRegisterStudioLeave } from "@/components/studio-leave";
import { fontFaceCss } from "@/lib/board-fonts";
import { MENU_LIMITS, parseLayout, type LayoutDocument } from "@/lib/layout-studio";
import { accountSaveBody, readAccountStudio, type AccountLibraryFile } from "@/lib/layout-account";
import {
  MENU_DESIGNS, designById, designDocument, designHasMedia, filterDesigns, isPhotoDesign, scratchDocument, stockPhotoPath, switchDesign,
  type DesignBusiness, type DesignStyle, type MenuDesign,
} from "@/lib/menu-designs";
import { designColors, designSvgWithReport, hasOwnerItemPhoto, itemPhotosShown } from "@/lib/menu-design-svg";
import type { Brand } from "@/lib/brand-kit";
import { moveItem, splitLastItems, withItemPhoto } from "@/lib/menu-item-photos";

const FONT_CSS = fontFaceCss();

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

type Art = { imageHref: string | null; logoHref: string | null; itemImages?: Record<string, string> };

/** The board exactly as the TV will show it. */
export function DesignBoard({ doc, art, label, className = "" }: { doc: LayoutDocument; art: Art; label?: string; className?: string }) {
  const svg = useMemo(() => designSvgWithReport(doc, { imageHref: art.imageHref, logoHref: art.logoHref, itemImages: art.itemImages }).svg, [doc, art.imageHref, art.logoHref, art.itemImages]);
  return (
    <div className={`tpl-board ${className}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

const STYLES = `${FONT_CSS}
.tpl-board { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; background: #000; }
.tpl-board > svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.tpl-chip { border: 1px solid var(--color-line); background: #fff; border-radius: 999px; padding: 6px 12px; font-size: 13px; font-weight: 600; min-height: 36px; }
.tpl-chip[aria-pressed="true"] { background: var(--color-navy-900, #0a1730); border-color: var(--color-navy-900, #0a1730); color: #fff; }
.tpl-card { display: flex; flex-direction: column; gap: 10px; text-align: left; padding: 10px; border: 1px solid var(--color-line); border-radius: 14px; background: #fff; transition: border-color .15s, box-shadow .15s, transform .15s; }
.tpl-card:hover { border-color: var(--color-primary); box-shadow: 0 10px 26px rgb(11 18 32 / .1); transform: translateY(-2px); }
.tpl-card .tpl-board { border-radius: 9px; }
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
.tpl-item .tpl-hidden { position: absolute; inset: auto 0 0 0; background: rgb(11 18 32 / .78); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 0; text-align: center; }
.tpl-item .tpl-photo:has(img) { border-style: solid; border-color: var(--color-line); }
.tpl-item .desc { grid-column: 2 / 4; }
.tpl-item .acts { grid-row: 1 / 3; grid-column: 4; display: flex; flex-direction: column; gap: 3px; }
@media (max-width: 420px) { .tpl-item { grid-template-columns: 52px minmax(0, 1fr) 76px auto; } .tpl-item .tpl-photo { width: 52px; height: 52px; } }
.tpl-ib { width: 32px; height: 30px; border: 1px solid var(--color-line); background: #fff; border-radius: 7px; display: grid; place-items: center; font-size: 13px; padding: 0; }
.tpl-ib:disabled { opacity: .35; }
.tpl-lib { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 8px; }
.tpl-lib button { border: 2px solid transparent; padding: 0; border-radius: 9px; overflow: hidden; aspect-ratio: 1; background: #ddd; }
.tpl-lib button[aria-pressed="true"] { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgb(26 92 255 / .25); }
.tpl-lib img { width: 100%; height: 100%; object-fit: cover; display: block; }
.tpl-var { border: 2px solid var(--color-line); background: #fff; border-radius: 11px; padding: 6px; display: grid; gap: 6px; text-align: left; font-size: 12px; font-weight: 700; }
.tpl-var[aria-pressed="true"] { border-color: var(--color-primary); }
.tpl-sw { display: flex; height: 24px; border-radius: 7px; overflow: hidden; box-shadow: inset 0 0 0 1px rgb(0 0 0 / .08); }
.tpl-sw span { flex: 1; }
.tpl-ck { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; padding: 7px 10px; border-radius: 9px; background: #f0f8f4; color: #0a5c3e; }
.tpl-ck.adj { background: #fff6e5; color: #7a4a00; }
.tpl-grid { display: grid; gap: 20px; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1100px) { .tpl-grid { grid-template-columns: minmax(360px, 420px) minmax(0, 1fr); align-items: start; } .tpl-preview { position: sticky; top: 72px; grid-column: 2; grid-row: 1; } .tpl-form { grid-column: 1; grid-row: 1; } }
@media (max-width: 1099px) { .tpl-preview { position: sticky; top: 56px; z-index: 5; background: var(--color-paper, #f1f4fa); padding-bottom: 10px; } }
@media (prefers-reduced-motion: reduce) { .tpl-card { transition: none; } .tpl-card:hover { transform: none; } }
`;

const BUSINESSES: (DesignBusiness | "all")[] = ["all", "restaurant", "cafe", "fast", "bar", "sweets"];
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
      <div className="flex flex-wrap gap-x-5 gap-y-2 items-center mt-4">
        <div className="flex flex-wrap gap-1.5 items-center" role="group" aria-label={t("tpl.filterBusiness")}>
          <span className="text-xs font-bold uppercase tracking-wide text-muted mr-1">{t("tpl.filterBusiness")}</span>
          {BUSINESSES.map((id) => (
            <button key={id} type="button" className="tpl-chip" aria-pressed={business === id} onClick={() => setBusiness(id)}>{t(`tpl.business.${id}` as MessageKey)}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 items-center" role="group" aria-label={t("tpl.filterStyle")}>
          <span className="text-xs font-bold uppercase tracking-wide text-muted mr-1">{t("tpl.filterStyle")}</span>
          {STYLE_IDS.map((id) => (
            <button key={id} type="button" className="tpl-chip" aria-pressed={style === id} onClick={() => setStyle(id)}>{t(`tpl.style.${id}` as MessageKey)}</button>
          ))}
        </div>
      </div>
      <p className="sr-only" role="status">{t("tpl.count", { n: shown.length })}</p>
      <ul className="grid gap-4 mt-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("tpl.galleryTitle")}>
        {shown.map((design) => (
          <li key={design.id} className="min-w-0 flex">
            <button type="button" className="tpl-card w-full" data-testid={`template-${design.id}`}
              onClick={() => onPick(designDocument(design), design.name[locale === "es" ? "es" : "en"])}>
              <DesignBoard doc={designDocument(design)} art={noArt} />
              <span className="font-display font-bold text-[15px]">{design.name[locale === "es" ? "es" : "en"]}</span>
              <span className="text-sm text-muted">{design.blurb[locale === "es" ? "es" : "en"]}</span>
              <span className="flex flex-wrap gap-1.5 mt-auto">
                <span className="tpl-tag">{t(`tpl.business.${design.business}` as MessageKey)}</span>
                <span className="tpl-tag">{t(`tpl.style.${design.style}` as MessageKey)}</span>
                <span className="tpl-tag">{t("tpl.colourStyles", { n: design.variants.length })}</span>
                {isPhotoDesign(design) ? <span className="tpl-tag">{t("tpl.itemPhotosTag")}</span> : null}
              </span>
              <span className="btn btn-primary min-h-10 self-start" aria-hidden>{t("tpl.use")}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 ? <li className="text-sm text-muted">{t("tpl.noMatch")}</li> : null}
        <li className="min-w-0 sm:col-span-2 xl:col-span-3">
          <button type="button" className="tpl-card w-full sm:flex-row sm:items-center" data-testid="template-scratch" onClick={() => onPick(scratchDocument(), "")}>
            <span className="grid place-items-center rounded-lg border-2 border-dashed border-line text-muted font-bold sm:w-44 aspect-video" aria-hidden>＋</span>
            <span className="grid gap-1"><span className="font-display font-bold">{t("tpl.scratch")}</span><span className="text-sm text-muted">{t("tpl.scratchBody")}</span></span>
          </button>
        </li>
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ editor ------------------------------------------------------------------ */

type Step = 0 | 1 | 2 | 3;
const blankItem = () => ({ name: "", price: "", description: "" });
function itemCount(doc: LayoutDocument) { return doc.sections.reduce((a, s) => a + s.items.length, 0); }

export function TemplateEditor({
  menuId: initialMenuId, name: initialName, document: initialDoc, displays, brand, preview = false, onClose, onAdvanced, onSaved, onSplit,
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
  /** Open a new board with the items that didn't fit (same template). */
  onSplit?: (document: LayoutDocument, name: string) => void;
}) {
  const { locale, t } = useLocale();
  const L = locale === "es" ? "es" : "en";
  const toast = useToast();
  const [doc, setDoc] = useState<LayoutDocument>(initialDoc);
  const [name, setName] = useState(initialName || initialDoc.title || t("tpl.untitled"));
  const [menuId, setMenuId] = useState<string | null>(initialMenuId);
  const [step, setStep] = useState<Step>(0);
  const [dirty, setDirty] = useState(!initialMenuId);
  const [busy, setBusy] = useState<null | "draft" | "publish" | "upload">(null);
  const [library, setLibrary] = useState<AccountLibraryFile[]>([]);
  const [publishOpen, setPublishOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [published, setPublished] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useRegisterStudioLeave(() => dirtyRef.current);
  const design = designById(doc.design) ?? designById("coffee-shop")!;

  async function reloadLibrary() {
    if (preview) {
      // UI preview only (no account): two bundled sample photos stand in for the owner's media.
      const sample: AccountLibraryFile[] = ["salad", "bowl"].map((n) => ({ id: `00000000-0000-4000-8000-00000000f00${n === "salad" ? 1 : 2}`, name: `${n}.jpg`, kind: "image", mime: "image/jpeg", url: `/menu-templates/${n}.jpg` }));
      setLibrary(sample);
      return sample;
    }
    const body = readAccountStudio(await api("/api/layout-studio"));
    const next = body?.library ?? [];
    setLibrary(next);
    return next;
  }
  useEffect(() => { void reloadLibrary().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const urlFor = (id: string | null | undefined) => (id ? library.find((f) => f.id === id)?.url ?? null : null);
  // Item photos in the preview use the same signed library URLs the photo picker shows.
  const itemImages = useMemo(() => Object.fromEntries(library.filter((f) => f.kind === "image" && f.url).map((f) => [f.id, f.url as string])), [library]);
  const art: Art = { imageHref: urlFor(doc.imageMediaId), logoHref: urlFor(doc.logoMediaId), itemImages };
  const report = useMemo(() => designSvgWithReport(doc, art).report, [doc, art.imageHref, art.logoHref]); // eslint-disable-line react-hooks/exhaustive-deps
  const [photoFor, setPhotoFor] = useState<{ si: number; ii: number } | null>(null);
  function setItemPhoto(si: number, ii: number, imageMediaId: string | null) {
    update({ ...doc, sections: withItemPhoto(doc.sections, si, ii, imageMediaId) });
    // Say exactly what happens to the photo: it shows on the board unless the owner chose to hide item photos.
    if (imageMediaId) toast.show(doc.photoStyle === "text" && design.composition !== "cards" && design.composition !== "featured" ? t("tpl.photoSavedHidden") : t("tpl.photoAdded"));
  }
  function moveItemAt(si: number, ii: number, dir: -1 | 1) { update({ ...doc, sections: moveItem(doc.sections, si, ii, dir) }); }
  /** Move the items that don't fit (the last ones in reading order) to a new board with the same template. */
  function splitOverflow() {
    const split = splitLastItems(doc.sections, report.dropped);
    const kept = { ...doc, sections: split.kept };
    update(kept);
    // Keep this board safe first (as a draft), then open the new board with the moved items.
    void (async () => {
      const saved = preview ? "preview" : await save("draft", kept);
      if (saved) onSplit?.({ ...doc, sections: split.moved }, `${name} (2)`);
    })();
  }
  const colors = useMemo(() => designColors(doc, design), [doc, design]);

  function update(next: LayoutDocument) { setDoc(next); setDirty(true); }
  function patch(p: Partial<LayoutDocument>) { update({ ...doc, ...p }); }
  function setSections(fn: (s: LayoutDocument["sections"]) => LayoutDocument["sections"]) { update({ ...doc, sections: fn(doc.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) }))) }); }

  async function upload(file: File | undefined, role: "photo" | "logo" | "item", target?: { si: number; ii: number }) {
    if (!file || preview) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.show(t("tpl.photoType"), true); return; }
    setBusy("upload");
    try {
      const form = new FormData(); form.set("file", file); form.set("name", file.name);
      const body = await authToken().then((token) => uploadForm("/api/media", form, token, () => {})) as { id?: string };
      await reloadLibrary();
      if (body.id && role === "item" && target) setItemPhoto(target.si, target.ii, body.id);
      else if (body.id) patch(role === "photo" ? { imageMediaId: body.id } : { logoMediaId: body.id });
      toast.show(t("tpl.uploaded"));
    } catch (err) {
      toast.show((err as Error).message || t("tpl.uploadFailed"), true);
    } finally {
      setBusy(null);
    }
  }

  async function save(mode: "draft" | "publish", override?: LayoutDocument) {
    if (preview) { toast.show(t("tpl.previewOnly")); return null; }
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

  async function publishTo() {
    const id = await save("publish");
    if (!id) return;
    const ids = Object.keys(picked).filter((k) => picked[k]);
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
      ...(brand.logoMediaId ? { logoMediaId: brand.logoMediaId } : {}),
    });
  }
  function restoreTemplate() {
    update({ ...doc, primaryColor: null, accentColor: null, textColor: null, backgroundColor: null, font: design.look.head, ...(design.look.body !== design.look.head ? { bodyFont: design.look.body } : {}) });
  }

  const n = itemCount(doc);
  const photosShown = itemPhotosShown(doc, design);
  const ownerPhotos = hasOwnerItemPhoto(doc);
  const photosHidden = ownerPhotos && !photosShown;
  const photoTemplate = isPhotoDesign(design) || itemPhotosShown(doc, design);
  // A roomier template that still shows item photos when this one does: three-column thumbnails hold all 24 items.
  const roomierId = photoTemplate ? "taqueria-specials" : "diner-classics";
  const roomier = report.dropped > 0 && design.id !== roomierId ? designById(roomierId) : null;
  const canHidePhotos = report.dropped > 0 && design.composition !== "cards" && design.composition !== "featured" && itemPhotosShown(doc, design);
  const images = library.filter((f) => f.kind === "image");
  const videos = library.filter((f) => f.kind === "video");
  const stepNames = [t("tpl.step.business"), t("tpl.step.menu"), t("tpl.step.photos"), t("tpl.step.look")];

  return (
    <section data-testid="template-editor" aria-labelledby="tpl-editor-title">
      <style>{STYLES}</style>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button type="button" className="btn btn-quiet" onClick={onClose}>← {t("tpl.back")}</button>
        <label className="sr-only" htmlFor="tpl-name">{t("tpl.boardName")}</label>
        <input id="tpl-name" className="field font-display font-bold text-lg max-w-xs" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
        <span className={`badge ${published ? "badge-live" : ""}`} data-testid="tpl-status">{published ? t("tpl.statusLive") : dirty ? t("tpl.statusUnsaved") : t("tpl.statusSaved")}</span>
        <span className="flex-1" />
        <button type="button" className="btn btn-quiet" disabled={busy !== null} onClick={async () => {
          const id = menuId ?? (await save("draft"));
          if (id) onAdvanced(id);
        }}>{t("tpl.advanced")}</button>
        <button type="button" className="btn btn-quiet" disabled={busy !== null} data-testid="tpl-save-draft"
          onClick={async () => { if (await save("draft")) toast.show(t("tpl.draftSaved")); }}>{busy === "draft" ? t("tpl.saving") : t("ls.saveDraft")}</button>
        <button type="button" className="btn btn-primary" disabled={busy !== null} data-testid="tpl-publish" onClick={() => setPublishOpen(true)}>{t("ls.publish")}</button>
      </div>
      <h2 id="tpl-editor-title" className="sr-only">{t("tpl.editorTitle")}</h2>
      <div className="tpl-grid">
        <div className="tpl-preview">
          <p className="text-xs text-muted mb-2 flex justify-between gap-2"><span>{t("tpl.previewCap")}</span><span>1920 × 1080</span></p>
          <DesignBoard doc={doc} art={art} className="tpl-tv" label={t("tpl.previewAria", { name })} />
          {report.dropped > 0 ? (
            <div className="note-warn text-sm mt-3 grid gap-2" role="status" data-testid="tpl-dropped">
              <p>{t(photoTemplate ? "tpl.droppedPhotos" : "tpl.dropped", { n: report.dropped })}</p>
              <div className="flex flex-wrap gap-2">
                {roomier ? <button type="button" className="btn btn-quiet min-h-9" onClick={() => update(switchDesign(doc, roomier))} data-testid="tpl-roomier">{t("tpl.useRoomier", { name: roomier.name[L] })}</button> : null}
                {canHidePhotos ? <button type="button" className="btn btn-quiet min-h-9" onClick={() => patch({ photoStyle: "text" })} data-testid="tpl-hide-photos">{t("tpl.itemPhotosHidden")}</button> : null}
                {onSplit ? <button type="button" className="btn btn-quiet min-h-9" onClick={splitOverflow} data-testid="tpl-split">{t("tpl.splitBoard", { n: report.dropped })}</button> : null}
              </div>
            </div>
          )
            : report.scale < 0.72 ? <p className="text-sm mt-3 text-[#7a4a00]" role="status">{t("tpl.tight")}</p>
              : <p className="text-sm mt-3 text-live-ink" role="status">✓ {t("tpl.fits")}</p>}
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
                <div className="flex flex-wrap gap-2">
                  {brand?.logoMediaId ? <button type="button" className="btn btn-quiet" onClick={() => patch({ logoMediaId: brand.logoMediaId })}>{t("tpl.logoFromKit")}</button> : null}
                  <label className="btn btn-quiet cursor-pointer">{t("tpl.uploadLogo")}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void upload(e.target.files?.[0], "logo")} /></label>
                  {doc.logoMediaId ? <button type="button" className="btn btn-quiet text-danger" onClick={() => patch({ logoMediaId: null })}>{t("tpl.removeLogo")}</button> : null}
                </div>
                <p className="text-xs text-muted">{doc.logoMediaId ? t("tpl.logoOn") : t("tpl.logoOff")}</p>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-3">
              <div className="flex justify-between items-baseline gap-2"><h3 className="font-display font-bold text-lg">{t("tpl.menuTitle")}</h3><span className="text-xs text-muted">{t("tpl.limits", { n, max: MENU_LIMITS.items, sections: MENU_LIMITS.sections })}</span></div>
              {photosHidden ? (
                <div className="note-warn text-sm grid gap-2" role="status" data-testid="tpl-photos-hidden">
                  <p>{t("tpl.photosHiddenNote")}</p>
                  <button type="button" className="btn btn-quiet min-h-9 justify-self-start" onClick={() => patch({ photoStyle: "thumbs" })} data-testid="tpl-show-photos">{t("tpl.showItemPhotos")}</button>
                </div>
              ) : ownerPhotos && !isPhotoDesign(design) ? (
                <p className="text-sm text-live-ink" role="status" data-testid="tpl-photos-shown">✓ {t("tpl.photosShownNote")}</p>
              ) : <p className="text-xs text-muted">{t("tpl.photoTip")}</p>}
              {doc.sections.map((section, si) => (
                <div className="tpl-sec" key={si}>
                  <div className="tpl-sec-h">
                    <input className="field font-bold" aria-label={t("tpl.sectionN", { n: si + 1 })} placeholder={t("tpl.section")} maxLength={30} value={section.name}
                      onChange={(e) => setSections((s) => { s[si].name = e.target.value; return s; })} />
                    <button type="button" className="tpl-ib" aria-label={t("tpl.moveSectionUp", { n: si + 1 })} disabled={si === 0} onClick={() => setSections((s) => { [s[si - 1], s[si]] = [s[si], s[si - 1]]; return s; })}>↑</button>
                    <button type="button" className="tpl-ib" aria-label={t("tpl.moveSectionDown", { n: si + 1 })} disabled={si === doc.sections.length - 1} onClick={() => setSections((s) => { [s[si + 1], s[si]] = [s[si], s[si + 1]]; return s; })}>↓</button>
                    <button type="button" className="tpl-ib text-danger" aria-label={t("tpl.removeSection", { n: si + 1 })} onClick={() => setSections((s) => s.filter((_, i) => i !== si))}>✕</button>
                  </div>
                  {section.items.map((item, ii) => (
                    <div className="tpl-item" key={ii}>
                      <button type="button" className="tpl-photo" onClick={() => setPhotoFor({ si, ii })} data-testid={`tpl-photo-${si}-${ii}`}
                        aria-label={`${item.imageMediaId || item.stockPhoto ? t("tpl.changePhotoFor", { name: item.name || t("tpl.item") }) : t("tpl.addPhotoFor", { name: item.name || t("tpl.item") })}${item.imageMediaId && photosHidden ? ` (${t("tpl.hiddenOnBoard")})` : ""}`}>
                        {item.imageMediaId && photosHidden ? <span className="tpl-hidden" aria-hidden>{t("tpl.hidden")}</span> : null}
                        {item.imageMediaId && urlFor(item.imageMediaId) ? <img src={urlFor(item.imageMediaId)!} alt="" />
                          : item.stockPhoto ? <img src={stockPhotoPath(item.stockPhoto)} alt="" />
                            : <span aria-hidden>＋<br />{t("tpl.photo")}</span>}
                      </button>
                      <input className="field" aria-label={t("tpl.itemName", { n: ii + 1 })} placeholder={t("tpl.item")} maxLength={MENU_LIMITS.itemName} value={item.name}
                        onChange={(e) => setSections((s) => { s[si].items[ii].name = e.target.value; return s; })} data-testid={`tpl-item-${si}-${ii}`} />
                      <input className="field text-right" aria-label={t("tpl.itemPrice", { n: ii + 1 })} placeholder={t("tpl.price")} maxLength={MENU_LIMITS.price} value={item.price}
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
              <button type="button" className="btn btn-quiet justify-self-start" disabled={doc.sections.length >= MENU_LIMITS.sections}
                onClick={() => setSections((s) => [...s, { name: "", items: [blankItem()] }])}>＋ {t("tpl.addSection")}</button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-3">
              <h3 className="font-display font-bold text-lg">{t("tpl.photosTitle")}</h3>
              {!designHasMedia(design) ? <p className="text-sm text-muted">{t("tpl.noPhotoArea")}</p> : (
                <>
                  <p className="text-sm text-muted">{t("tpl.photosLede")}</p>
                  <div className="flex flex-wrap gap-2">
                    <label className="btn btn-quiet cursor-pointer">{busy === "upload" ? t("tpl.uploading") : t("tpl.uploadPhoto")}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void upload(e.target.files?.[0], "photo")} /></label>
                    {design.stock ? <button type="button" className="btn btn-quiet" onClick={() => patch({ imageMediaId: null, stockPhoto: design.stock ?? undefined })}>{t("tpl.useSample")}</button> : null}
                    <button type="button" className="btn btn-quiet" onClick={() => patch({ imageMediaId: null, stockPhoto: undefined })}>{t("tpl.noPhoto")}</button>
                  </div>
                  <p className="form-label">{t("tpl.fromMedia")}</p>
                  {images.length ? (
                    <div className="tpl-lib">{images.map((f) => (
                      <button key={f.id} type="button" aria-pressed={doc.imageMediaId === f.id} aria-label={f.name} onClick={() => patch({ imageMediaId: f.id })}>{f.url ? <img src={f.url} alt="" /> : null}</button>
                    ))}</div>
                  ) : <p className="text-sm text-muted">{t("tpl.noMedia")}</p>}
                  {videos.length ? (
                    <label className="form-label grid gap-1">{t("tpl.video")}
                      <select className="field" value={doc.videoMediaId ?? ""} onChange={(e) => patch({ videoMediaId: e.target.value || null })}>
                        <option value="">{t("tpl.noVideo")}</option>
                        {videos.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                      <span className="text-xs text-muted font-normal">{t("tpl.videoNote")}</span>
                    </label>
                  ) : null}
                  <h4 className="font-semibold mt-1">{t("tpl.featureTitle")}</h4>
                  <label className="form-label grid gap-1">{t("tpl.featureHead")}<input className="field" maxLength={40} value={doc.featureTitle} onChange={(e) => patch({ featureTitle: e.target.value })} /></label>
                  <label className="form-label grid gap-1">{t("tpl.featureDetail")}<input className="field" maxLength={80} value={doc.featureDetail} onChange={(e) => patch({ featureDetail: e.target.value })} /></label>
                </>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-4">
              <h3 className="font-display font-bold text-lg">{t("tpl.lookTitle")}</h3>
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
              <div className="grid gap-2">
                <p className="form-label">{t("tpl.switchTitle")}</p>
                <p className="text-xs text-muted">{t("tpl.switchBody")}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto pr-1" role="group" aria-label={t("tpl.switchTitle")}>
                  {MENU_DESIGNS.map((d) => (
                    <SwitchCard key={d.id} design={d} current={doc} art={art} label={d.name[L]} onPick={() => update(switchDesign(doc, d))} />
                  ))}
                </div>
              </div>
              <div className="grid gap-2" data-testid="tpl-photo-style">
                <p className="form-label">{t("tpl.itemPhotosTitle")}</p>
                {design.composition === "cards" || design.composition === "featured" ? <p className="text-sm text-muted">{t("tpl.itemPhotosAlways")}</p> : (
                  <div className="seg" role="group" aria-label={t("tpl.itemPhotosTitle")}>
                    <button type="button" aria-pressed={itemPhotosShown(doc, design)} onClick={() => patch({ photoStyle: "thumbs" })}>{t("tpl.itemPhotosThumbs")}</button>
                    <button type="button" aria-pressed={!itemPhotosShown(doc, design)} onClick={() => patch({ photoStyle: "text" })}>{t("tpl.itemPhotosHidden")}</button>
                  </div>
                )}
                <p className="text-xs text-muted">{t("tpl.itemPhotosNote")}</p>
              </div>
              <div className="grid gap-2">
                <p className="form-label">{t("tpl.kitTitle")}</p>
                {brand && brand.custom ? (
                  <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-line">
                    <span className="size-6 rounded-md" style={{ background: brand.primaryColor }} aria-hidden />
                    <span className="size-6 rounded-md" style={{ background: brand.accentColor }} aria-hidden />
                    <span className="text-sm flex-1 min-w-[8rem]">{kitApplied ? t("tpl.kitOn") : t("tpl.kitOff")}</span>
                    {kitApplied ? <button type="button" className="btn btn-quiet" onClick={restoreTemplate} data-testid="tpl-restore">{t("tpl.restore")}</button>
                      : <button type="button" className="btn btn-primary" onClick={applyKit} data-testid="tpl-apply-kit">{t("tpl.applyKit")}</button>}
                  </div>
                ) : <p className="text-sm text-muted">{t("tpl.noKit")}</p>}
                {!kitApplied && (doc.primaryColor || doc.accentColor || doc.textColor || doc.backgroundColor) ? (
                  <button type="button" className="btn btn-quiet justify-self-start" onClick={restoreTemplate}>{t("tpl.restore")}</button>
                ) : null}
                <p className="text-xs text-muted">{t("tpl.kitNote")}</p>
              </div>
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
            </div>
          ) : null}

          <div className="flex justify-between gap-2 pt-2 border-t border-line">
            <button type="button" className="btn btn-quiet" disabled={step === 0} onClick={() => setStep((step - 1) as Step)}>← {step > 0 ? stepNames[step - 1] : ""}</button>
            {step < 3 ? <button type="button" className="btn btn-primary" onClick={() => setStep((step + 1) as Step)}>{stepNames[step + 1]} →</button>
              : <button type="button" className="btn btn-primary" onClick={() => setPublishOpen(true)}>{t("ls.publish")} →</button>}
          </div>
        </div>
      </div>

      {publishOpen ? (
        <Dialog label={t("tpl.publishTitle")} onClose={() => setPublishOpen(false)} className="bg-paper w-full max-w-lg rounded-2xl p-5" variant="center">
          <div className="grid gap-3" data-testid="tpl-publish-dialog">
            <h3 className="font-display font-bold text-lg">{t("tpl.publishTitle")}</h3>
            {report.dropped > 0 ? <p className="note-warn text-sm" role="alert" data-testid="tpl-publish-blocked">{t("tpl.publishBlocked", { n: report.dropped })}</p> : null}
            <p className="text-sm text-muted">{t("tpl.publishBody")}</p>
            {displays === null ? <p className="text-sm text-muted">{t("common.loading")}</p> : displays.length === 0 ? <p className="text-sm text-muted">{t("tpl.noScreens")}</p> : (
              <ul className="grid gap-2">
                {displays.map((d) => (
                  <li key={d.id}>
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-line min-h-11">
                      <input type="checkbox" className="size-5" checked={!!picked[d.id]} onChange={(e) => setPicked({ ...picked, [d.id]: e.target.checked })} />
                      <span className="flex-1 min-w-0"><span className="font-semibold block break-words">{d.name}</span></span>
                      <span className={`badge ${d.online ? "badge-live" : ""}`}>{d.online ? t("tpl.online") : t("tpl.offline")}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">{t("tpl.publishNote")}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-quiet" onClick={() => setPublishOpen(false)}>{t("tpl.cancel")}</button>
              <button type="button" className="btn btn-primary" disabled={busy !== null || report.dropped > 0} onClick={() => void publishTo()} data-testid="tpl-publish-confirm">
                {busy === "publish" ? t("tpl.publishing") : t("tpl.publishN", { n: Object.values(picked).filter(Boolean).length })}
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}

      {photoFor && doc.sections[photoFor.si]?.items[photoFor.ii] ? (() => {
        const item = doc.sections[photoFor.si].items[photoFor.ii];
        const label = item.name || t("tpl.item");
        const images = library.filter((f) => f.kind === "image");
        return (
          <Dialog label={t("tpl.photoFor", { name: label })} onClose={() => setPhotoFor(null)} className="bg-paper w-full max-w-xl rounded-2xl p-5 max-h-[85dvh] overflow-y-auto" variant="center">
            <div className="grid gap-3" data-testid="tpl-item-photo-dialog">
              <h3 className="font-display font-bold text-lg break-words">{t("tpl.photoFor", { name: label })}</h3>
              <p className="text-sm text-muted">{t("tpl.photoForBody")}</p>
              <div className="flex flex-wrap gap-2">
                <label className="btn btn-primary cursor-pointer">{busy === "upload" ? t("tpl.uploading") : t("tpl.uploadPhoto")}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" data-testid="tpl-item-upload"
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
              {doc.photoStyle === "text" && design.composition !== "cards" && design.composition !== "featured" ? (
                <div className="note-warn text-sm grid gap-2" data-testid="tpl-dialog-hidden">
                  <p>{t("tpl.photoHiddenHint")}</p>
                  <button type="button" className="btn btn-quiet min-h-9 justify-self-start" onClick={() => patch({ photoStyle: "thumbs" })}>{t("tpl.showItemPhotos")}</button>
                </div>
              ) : <p className="text-xs text-muted" data-testid="tpl-dialog-where">{isPhotoDesign(design) ? t("tpl.photoWhereCards") : t("tpl.photoWhereThumbs", { name: label })}</p>}
              <div className="flex justify-end"><button type="button" className="btn btn-quiet" onClick={() => setPhotoFor(null)}>{t("tpl.done")}</button></div>
            </div>
          </Dialog>
        );
      })() : null}
    </section>
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

export { stockPhotoPath };
