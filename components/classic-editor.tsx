"use client";

import { useEffect, useRef, useState } from "react";
import { api, authToken, type DisplayItem, type MediaItem } from "@/lib/api";
import { MENU_LIMITS, MENU_TEMPLATES, type MenuContent, type MenuTemplate } from "@/lib/menu-templates";
import { classicPreviewHits, confirmDiscardUnsaved, hasUnsavedEdits } from "@/lib/menu-board-unify";
import { StudioStyles, useStudioBreakpoint } from "@/components/studio-chrome";
import { StudioGuardedLink, useRegisterStudioLeave } from "@/components/studio-leave";
import { seedFreshClassicIfClean, type Brand } from "@/lib/brand-kit";
import { canAddItem, canAddSection, firstNamelessItem, sectionLimitMessage, ITEM_NAME_REQUIRED, menuCounts, moveItem, moveSection, needsName, normalizePrice } from "@/lib/menu-fields";
import { ItemNotes, MenuLimits, OrderButtons } from "@/components/menu-item-fields";
import { DirectImageUpload } from "@/components/direct-image-upload";

export type ClassicSaved = { id: string; name: string; playlistId: string | null; tickedScreens: number };

export type ClassicDraft = {
  id: string | null;
  name: string;
  template: MenuTemplate;
  content: MenuContent;
  displayIds: string[];
  imageUrl?: string | null;
};

/** QA U1-04c: retries when the preview reports the photo isn't readable yet (503). */
export const PHOTO_RETRY_LIMIT = 2;
export const PHOTO_RETRY_MS = 1200;

type ClassicStep = "preview" | "content" | "photo" | "style" | "publish";

const STEP_LABEL: Record<ClassicStep, string> = {
  preview: "Preview",
  content: "Content",
  photo: "Photo",
  style: "Style",
  publish: "Save",
};

export function ClassicEditor({
  draft,
  setDraft,
  displays,
  images,
  onSaved,
  onError,
  previewSrc,
  readOnly,
  brand,
  onImageUploaded,
}: {
  draft: ClassicDraft;
  images: MediaItem[];
  setDraft: (d: ClassicDraft | null) => void;
  displays: DisplayItem[];
  /** E2b: `saved` describes the board so the page can offer "Show on which screen?". */
  onSaved: (message: string, saved?: ClassicSaved) => void;
  onError: (message: string) => void;
  previewSrc?: string;
  readOnly?: boolean;
  brand?: Brand | null;
  /** Reload the media list after a direct photo upload (E3). Absent in fixtures. */
  onImageUploaded?: () => Promise<void>;
}) {
  const [step, setStep] = useState<ClassicStep>("content");
  const studioBp = useStudioBreakpoint();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(previewSrc ?? draft.imageUrl ?? null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(!previewSrc && !draft.imageUrl && !readOnly);
  const [region, setRegion] = useState<"menu" | "photo">("menu");
  const last = useRef<string | null>(null);
  const firstFetch = useRef(true);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const photoPanelRef = useRef<HTMLDetailsElement | null>(null);
  const photoSelectRef = useRef<HTMLSelectElement | null>(null);
  const [nameCheck, setNameCheck] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewRetry, setPreviewRetry] = useState(0);
  // Up/Down moves refresh the preview at once instead of after the typing debounce (QA retest 3 low).
  const refreshNow = useRef(false);
  // QA U1-04c: a photo that is not readable yet gets a couple of quiet retries before the error shows.
  const photoRetries = useRef(0);
  const latest = useRef({ draft, setDraft });
  latest.current = { draft, setDraft };
  const baseline = useRef({ name: draft.name, template: draft.template, content: draft.content, displayIds: draft.displayIds });

  // Seed a new, still-clean draft when the brand kit arrives after mount, and
  // advance the baseline so Back and the leave guard do not prompt. Existing
  // boards and drafts the user has already edited are left alone.
  useEffect(() => {
    if (readOnly || draft.id) return;
    const next = seedFreshClassicIfClean(draft, brand, baseline.current);
    if (!next) return;
    baseline.current = next.baseline;
    setDraft(next.draft);
    // draft and setDraft are current for this brand load; do not re-run on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, draft.id, readOnly]);

  const c = draft.content;
  const update = (content: MenuContent) => setDraft({ ...draft, content });
  const counts = menuCounts(c.sections);
  const hasPhoto = Boolean(c.photoMediaId);
  const hits = classicPreviewHits(hasPhoto);
  const saveLabel = busy ? (draft.id ? "Saving…" : "Creating…") : draft.id ? "Save changes" : "Create menu board";

  useEffect(() => {
    if (readOnly) {
      if (previewSrc) {
        setPreview(previewSrc);
        setPreviewLoading(false);
      }
      return;
    }
    let cancelled = false;
    // Abort the in-flight render when a newer edit or move supersedes it (no overlapping POSTs).
    const abort = new AbortController();
    const run = async () => {
      setPreviewBusy(true);
      try {
        const token = await authToken();
        if (cancelled) return;
        const res = await fetch("/api/menus/preview", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ template: draft.template, content: draft.content }),
          signal: abort.signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled && res.status === 503 && photoRetries.current < PHOTO_RETRY_LIMIT) {
            photoRetries.current += 1;
            window.setTimeout(() => { refreshNow.current = true; setPreviewRetry((n) => n + 1); }, PHOTO_RETRY_MS);
            return;
          }
          if (!cancelled) {
            setPreviewError(body.error || "Preview unavailable.");
            setPreviewLoading(false);
            setPreviewBusy(false);
          }
          return;
        }
        const url = URL.createObjectURL(await res.blob());
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (last.current) URL.revokeObjectURL(last.current);
        last.current = url;
        photoRetries.current = 0;
        setPreview(url);
        setPreviewError(null);
        setPreviewLoading(false);
        setPreviewBusy(false);
      } catch {
        if (!cancelled) {
          setPreviewError("Preview unavailable.");
          setPreviewLoading(false);
          setPreviewBusy(false);
        }
      }
    };
    // First open: fetch immediately so the preview is not a blank navy box.
    // Later edits keep the 450ms debounce.
    if (firstFetch.current) {
      firstFetch.current = false;
      void run();
      return () => {
        cancelled = true;
        abort.abort();
      };
    }
    // Moves refresh after a short 150ms debounce (rapid Up/Down coalesces); typing keeps 450ms.
    const delay = refreshNow.current ? 150 : 450;
    refreshNow.current = false;
    const timer = window.setTimeout(() => { void run(); }, delay);
    return () => {
      cancelled = true;
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [draft.template, draft.content, readOnly, previewSrc, previewRetry]);

  useEffect(() => () => {
    if (last.current) URL.revokeObjectURL(last.current);
  }, []);

  function selectRegion(id: "menu" | "photo") {
    setRegion(id);
    setStep(id === "photo" ? "photo" : "content");
    if (id === "photo") {
      // Open the photo controls under the board and move focus there (QA U1-04a). A collapsed
      // <details> stays collapsed when only React's open prop is unchanged, so open it directly.
      window.setTimeout(() => {
        if (photoPanelRef.current) photoPanelRef.current.open = true;
        photoPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        photoSelectRef.current?.focus({ preventScroll: true });
      }, 0);
      return;
    }
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 860px)").matches) {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function isDirty() {
    const current = { name: draft.name, template: draft.template, content: draft.content, displayIds: draft.displayIds };
    return hasUnsavedEdits(current, baseline.current);
  }
  useRegisterStudioLeave(isDirty);

  function requestClose() {
    if (!confirmDiscardUnsaved(isDirty())) return;
    setDraft(null);
  }

  function goPreview() {
    setStep("preview");
    document.getElementById("studio-tv-preview")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function save() {
    if (readOnly) return;
    // A row with a price or description but no name would be dropped on save. Ask for the name instead (QA B1-02).
    const nameless = firstNamelessItem(c.sections);
    if (nameless) {
      setNameCheck(true);
      setRegion("menu");
      setStep("content");
      onError(ITEM_NAME_REQUIRED);
      window.setTimeout(() => document.getElementById(`classic-item-${nameless.section}-${nameless.item}-name`)?.focus(), 0);
      return;
    }
    setBusy(true);
    try {
      const body = JSON.stringify({ name: draft.name, template: draft.template, content: draft.content, ...(draft.displayIds.length ? { displayIds: draft.displayIds } : {}) });
      const res = draft.id
        ? await api<{ id?: string; playlistId?: string | null; published?: boolean }>(`/api/menus/${draft.id}`, { method: "PATCH", body })
        : await api<{ id?: string; playlistId?: string | null; published?: boolean; warning?: string }>("/api/menus", { method: "POST", body });
      const warning = (res as { warning?: string }).warning;
      if (warning) onError(warning);
      const savedId = res.id ?? draft.id;
      onSaved(
        draft.id ? "Menu updated. Screens showing it refresh within a minute." : draft.displayIds.length ? "Menu board created and sent to your screens" : "Menu board created. It's saved in Menu Boards and Media. Add it to a playlist or a screen when you're ready.",
        savedId ? { id: savedId, name: draft.name, playlistId: res.playlistId ?? null, tickedScreens: draft.displayIds.length } : undefined,
      );
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const blankItem = () => ({ name: "", price: "", description: "" });

  function renderStage(interactive: boolean, testId?: string) {
    return (
      <div
        className="preview-frame studio-canvas-stage"
        data-testid={testId}
        style={{ aspectRatio: "16 / 9", position: "relative", background: preview ? "#111" : "#e8edf4", borderRadius: 12, overflow: "hidden" }}
      >
        {preview ? (
          <img src={preview} alt="Menu board preview" data-testid={testId ? "menu-preview" : undefined} className="w-full h-full object-contain" />
        ) : null}
        {preview && previewBusy ? (
          <span role="status" style={{ position: "absolute", top: 8, right: 8, padding: "2px 8px", borderRadius: 999, background: "rgba(0,0,0,.65)", color: "#fff", fontSize: 12 }}>Updating preview…</span>
        ) : null}
        {preview && previewError && !previewBusy ? (
          <span role="alert" style={{ position: "absolute", top: 8, right: 8, display: "flex", alignItems: "center", gap: 8, padding: "2px 4px 2px 10px", borderRadius: 999, background: "rgba(120,20,20,.85)", color: "#fff", fontSize: 12 }}>
            Preview didn&apos;t update.
            <button type="button" onClick={() => { refreshNow.current = true; setPreviewRetry((n) => n + 1); }} style={{ background: "#fff", color: "#7a1414", borderRadius: 999, padding: "2px 8px", fontWeight: 600 }}>Try again</button>
          </span>
        ) : null}
        {preview ? null : (
          <p style={{ margin: 0, padding: 16, fontSize: 14, color: "#5c6474", textAlign: "center" }}>{previewLoading ? "Loading preview…" : previewError || "Preview will appear here."}</p>
        )}
        {interactive
          ? hits.map((hit) => (
              <button
                key={hit.id}
                type="button"
                aria-label={hit.label}
                aria-pressed={region === hit.id}
                className={`absolute border-2 ${region === hit.id ? "border-primary bg-primary/10" : "border-transparent hover:border-primary/50"}`}
                style={{
                  left: `${(hit.box.x / 1920) * 100}%`,
                  top: `${(hit.box.y / 1080) * 100}%`,
                  width: `${(hit.box.w / 1920) * 100}%`,
                  height: `${(hit.box.h / 1080) * 100}%`,
                }}
                onClick={() => selectRegion(hit.id)}
              />
            ))
          : null}
        {interactive && !hasPhoto ? (
          <button type="button" className="classic-add-photo" onClick={() => selectRegion("photo")}>Add a photo</button>
        ) : null}
      </div>
    );
  }

  const editingLabel = region && (step === "content" || step === "photo") ? (
    <p className="text-sm font-medium">Editing: {region === "photo" ? "Photo" : "Menu"}</p>
  ) : null;

  const contentPanel = (
    <details className="studio-panel" open>
      <summary className="studio-panel-summary">Content &amp; text</summary>
      {region === "menu" ? editingLabel : null}
      <div id="menu-selected-editor" ref={editorRef} data-testid="menu-selected-editor" className="grid gap-3">
        <MenuLimits sections={counts.sections} items={counts.items} maxSections={counts.maxSections} maxItems={counts.maxItems} />
        <label className="grid gap-1"><span className="form-label">Title on screen</span>
          <input className="field" value={c.title} maxLength={MENU_LIMITS.title} onChange={(e) => update({ ...c, title: e.target.value })} /></label>
        <label className="grid gap-1"><span className="form-label">Subtitle</span>
          <input className="field" value={c.subtitle} maxLength={MENU_LIMITS.subtitle} onChange={(e) => update({ ...c, subtitle: e.target.value })} /></label>
        {c.sections.map((section, si) => (
          <section key={si} className="section-card" aria-labelledby={`classic-section-${si}`}>
            <div className="section-card-head">
              <h3 id={`classic-section-${si}`} className="section-card-legend">Section {si + 1}</h3>
              <OrderButtons className="section-order" kind="section" name={section.name} scope="classic-sections" index={si} count={c.sections.length}
                onMove={(dir) => { refreshNow.current = true; update({ ...c, sections: moveSection(c.sections, si, dir) }); }} />
              <button type="button" className="section-remove" aria-label={`Remove section ${si + 1}`}
                onClick={() => update({ ...c, sections: c.sections.filter((_, i) => i !== si) })}>Remove</button>
            </div>
            <input className="field" aria-label={`Section ${si + 1} name`} placeholder="e.g. Tacos" value={section.name} maxLength={MENU_LIMITS.sectionName}
              onChange={(e) => update({ ...c, sections: c.sections.map((s, i) => i === si ? { ...s, name: e.target.value } : s) })} />
            {section.items.map((item, ii) => {
              const setItem = (patch: Partial<typeof item>) => update({ ...c, sections: c.sections.map((s, i) => i === si ? { ...s, items: s.items.map((it, j) => j === ii ? { ...it, ...patch } : it) } : s) });
              const idBase = `classic-item-${si}-${ii}`;
              const nameInvalid = nameCheck && needsName(item);
              return (
                <div key={ii} className="item-card">
                  <input id={`${idBase}-name`} className="item-name" aria-label={`Item ${ii + 1} in section ${si + 1}`} placeholder="Item name" value={item.name} maxLength={MENU_LIMITS.itemName} onChange={(e) => setItem({ name: e.target.value })}
                    aria-invalid={nameInvalid || undefined} aria-describedby={nameInvalid ? `${idBase}-name-error` : undefined} />
                  <input className="item-price" aria-label={`Price ${ii + 1} in section ${si + 1}`} placeholder="$0.00" value={item.price} maxLength={MENU_LIMITS.price} onChange={(e) => setItem({ price: e.target.value })}
                    onBlur={(e) => { const next = normalizePrice(e.target.value); if (next !== item.price) setItem({ price: next }); if (needsName({ ...item, price: next })) setNameCheck(true); }}
                    aria-describedby={`${idBase}-price-hint`} />
                  <button type="button" className="item-remove" aria-label={`Remove item ${ii + 1} in section ${si + 1}`}
                    onClick={() => update({ ...c, sections: c.sections.map((s, i) => i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s) })}>
                    <span aria-hidden="true">×</span>
                  </button>
                  <input className="item-desc" aria-label={`Description ${ii + 1} in section ${si + 1}`} placeholder="Short description (optional)" value={item.description} maxLength={MENU_LIMITS.description} onChange={(e) => setItem({ description: e.target.value })}
                    onBlur={() => { if (needsName(item)) setNameCheck(true); }} aria-describedby={`${idBase}-desc-count`} />
                  <ItemNotes item={item} idBase={idBase} showNameError={nameCheck} />
                  <OrderButtons kind="item" name={item.name} scope={`classic-items-${si}`} index={ii} count={section.items.length}
                    onMove={(dir) => { refreshNow.current = true; update({ ...c, sections: moveItem(c.sections, si, ii, dir) }); }} />
                </div>
              );
            })}
            <button type="button" className="btn btn-quiet item-add" disabled={!canAddItem(c.sections, si)} onClick={() => update({ ...c, sections: c.sections.map((s, i) => i === si ? { ...s, items: [...s.items, blankItem()] } : s) })}>
              {canAddItem(c.sections, si) ? `Add item (${section.items.length} of ${MENU_LIMITS.itemsPerSection})` : section.items.length >= MENU_LIMITS.itemsPerSection ? `Section full (${MENU_LIMITS.itemsPerSection} items)` : `Menu full (${MENU_LIMITS.items} items)`}
            </button>
          </section>
        ))}
        <button type="button" className="btn btn-quiet justify-self-start min-h-11" disabled={!canAddSection(c.sections)} onClick={() => update({ ...c, sections: [...c.sections, { name: "", items: [blankItem()] }] })}>
          {canAddSection(c.sections) ? `Add section (${c.sections.length} of ${MENU_LIMITS.sections})` : sectionLimitMessage(c.sections)}
        </button>
        <label className="grid gap-1"><span className="form-label">Footer</span>
          <input className="field" value={c.footer} maxLength={MENU_LIMITS.footer} onChange={(e) => update({ ...c, footer: e.target.value })} /></label>
      </div>
    </details>
  );

  const photoPanel = (
    <details ref={photoPanelRef} className="studio-panel" open={step === "photo" || hasPhoto}>
      <summary className="studio-panel-summary">Photo</summary>
      {region === "photo" ? editingLabel : null}
      <label className="grid gap-1"><span className="form-label">Photo (optional)</span>
        <select ref={photoSelectRef} className="field" value={c.photoMediaId ?? ""} onChange={(e) => { update({ ...c, photoMediaId: e.target.value || null }); if (e.target.value) selectRegion("photo"); }}>
          <option value="">No photo</option>
          {images.map((m) => <option key={m.id} value={m.id}>{m.fileName}</option>)}
        </select>
        <span className="text-xs text-muted">{images.length ? "Shows on the right side of the menu. JPG or PNG from your media." : "No photos yet. Upload one below."}</span>
      </label>
      <DirectImageUpload
        what="photo"
        library={images}
        disabled={readOnly || !onImageUploaded}
        onUploaded={async (id) => {
          await onImageUploaded?.();
          // Use the newest draft and setter: the owner may have kept editing during the upload.
          const { draft: current, setDraft: apply } = latest.current;
          apply({ ...current, content: { ...current.content, photoMediaId: id } });
          setRegion("photo");
          // QA U1-04c: redraw the board with the new photo right away (also when the id was already selected).
          photoRetries.current = 0;
          refreshNow.current = true;
          setPreviewRetry((n) => n + 1);
        }}
      />
    </details>
  );

  const stylePanel = (
    <details className="studio-panel" open>
      <summary className="studio-panel-summary">Theme &amp; settings</summary>
      <fieldset>
        <legend className="form-label">Theme</legend>
        <div className="grid gap-3 grid-cols-3 mt-1">
          {MENU_TEMPLATES.map((t) => (
            <label key={t.id} className={`rounded-xl border p-3 cursor-pointer ${draft.template === t.id ? "border-primary ring-2 ring-primary/30" : "border-line"}`}>
              <input type="radio" name="menu-template" className="sr-only" checked={draft.template === t.id} onChange={() => setDraft({ ...draft, template: t.id })} />
              <span className="flex gap-1 mb-2" aria-hidden>
                <span className="h-6 flex-1 rounded" style={{ background: t.swatch[0], border: "1px solid #d5e2f2" }} />
                <span className="h-6 w-8 rounded" style={{ background: t.swatch[1] }} />
              </span>
              <span className="font-medium block">{t.name}</span>
              <span className="text-xs text-muted">{t.blurb}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-1 mt-3"><span className="form-label">Menu name (only you see this)</span>
        <input className="field" value={draft.name} maxLength={MENU_LIMITS.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label className="flex items-center gap-2 text-sm min-h-11">
        <input type="checkbox" checked={c.useBrand !== false} onChange={(e) => update({ ...c, useBrand: e.target.checked })} />
        Use my brand (logo and colours)
      </label>
      <p className="text-xs text-muted">Colours and the logo come from your <StudioGuardedLink href="/dashboard/account/brand-kit" className="font-semibold text-primary underline underline-offset-4">Brand Kit</StudioGuardedLink>. There is no separate brand form here.</p>
    </details>
  );

  const screensPanel = (
    <div>
      {displays.length ? (
        <fieldset className="grid gap-1">
          <legend className="form-label">Show on these screens now (optional)</legend>
          {displays.map((d) => (
            <label key={d.id} className="flex items-center gap-2 text-sm min-h-11">
              <input type="checkbox" checked={draft.displayIds.includes(d.id)}
                onChange={(e) => setDraft({ ...draft, displayIds: e.target.checked ? [...draft.displayIds, d.id] : draft.displayIds.filter((x) => x !== d.id) })} />
              {d.name}
            </label>
          ))}
          <p className="text-xs text-muted">Or leave these blank and use breakfast, lunch &amp; dinner times on the Schedule page.</p>
        </fieldset>
      ) : (
        <p className="text-xs text-muted">Saving updates any screens already showing this board within a minute. Assign screens from here or on the Schedule page.</p>
      )}
    </div>
  );

  return (
    <div className="studio-app" data-testid="menu-editor" data-embedded="true" style={{ background: "transparent", color: "#0b1220", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <header className="studio-toolbar">
        <div className="studio-toolbar-lead">
          <button type="button" className="studio-back" disabled={busy} onClick={requestClose}>Back to menu boards</button>
          <h1 className="studio-heading" style={{ margin: 0, fontSize: 18, fontWeight: 750 }}>{draft.id ? draft.name || "Edit menu board" : "New menu board"}</h1>
        </div>
        <div className="studio-toolbar-actions">
          <button type="button" className="btn btn-quiet min-h-11" onClick={goPreview}>Preview</button>
          <button type="button" className="btn btn-primary min-h-11" disabled={busy || readOnly} onClick={() => { void save(); }}>{saveLabel}</button>
        </div>
      </header>

      <div className="studio-grid">
        <div className="studio-left">
        <section className="studio-controls" data-testid="studio-tools">
          <div className={step === "content" ? "studio-pane on" : "studio-pane"} data-step="template">
            {contentPanel}
          </div>
          {/* Phones keep the Photo step in the stacked column; wider screens show it under the board. */}
          {studioBp === "phone" ? (
            <div className={step === "photo" ? "studio-pane on" : "studio-pane"} data-step="template">
              {photoPanel}
            </div>
          ) : null}
        </section>
        <section className="studio-controls studio-controls-end" data-testid="studio-tools-style">
          <div className={step === "style" ? "studio-pane on" : "studio-pane"} data-step="style">
            {stylePanel}
          </div>
          <div className={step === "publish" ? "studio-pane on" : "studio-pane"} data-step="publish">
            {screensPanel}
          </div>
        </section>
        </div>

        <section
          className={step === "preview" ? "studio-canvas on" : "studio-canvas"}
          id="studio-tv-preview"
          data-testid="studio-tv-preview"
          aria-label="Editing canvas"
        >
          <p className="studio-kicker">Board · preview of what your TV will show</p>
          <div className="studio-canvas-stage">{studioBp !== "phone" || step === "preview" ? renderStage(true, "menu-preview") : null}</div>
          {previewError ? <p className="text-sm text-danger" role="alert">{previewError}</p> : null}
          {studioBp !== "phone" ? (
            <div className="studio-canvas-tools" id="studio-canvas-tools" data-testid="studio-canvas-tools" role="region" aria-label="Photo controls" tabIndex={0}>
              {photoPanel}
            </div>
          ) : null}
        </section>
      </div>

      <div className="studio-savebar">
        {previewError ? <p className="studio-status" role="status">{previewError}</p> : null}
        <nav className="studio-tabs" role="tablist" aria-label="Editor steps">
          {(["preview", "content", "photo", "style", "publish"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={step === id}
              style={{ flex: "1 1 0", padding: "6px 2px", fontSize: 12, minHeight: 44 }}
              onClick={() => {
                setStep(id);
                if (id === "preview") document.getElementById("studio-tv-preview")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                if (id === "photo") setRegion("photo");
                if (id === "content") setRegion("menu");
              }}
            >{STEP_LABEL[id]}</button>
          ))}
        </nav>
        <div className="studio-save-actions">
          <button type="button" className="btn btn-primary min-h-11" disabled={busy || readOnly} onClick={() => { void save(); }}>{saveLabel}</button>
        </div>
      </div>
      <StudioStyles />
    </div>
  );
}
