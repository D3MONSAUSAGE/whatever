"use client";

import { useEffect, useRef, useState } from "react";
import { api, authToken, type DisplayItem, type MediaItem } from "@/lib/api";
import { MENU_LIMITS, MENU_TEMPLATES, type MenuContent, type MenuTemplate } from "@/lib/menu-templates";
import { classicPreviewHits, confirmDiscardUnsaved, hasUnsavedEdits } from "@/lib/menu-board-unify";
import { StudioStyles, useStudioBreakpoint } from "@/components/studio-chrome";
import { StudioGuardedLink, useRegisterStudioLeave } from "@/components/studio-leave";

export type ClassicDraft = {
  id: string | null;
  name: string;
  template: MenuTemplate;
  content: MenuContent;
  displayIds: string[];
  imageUrl?: string | null;
};

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
}: {
  draft: ClassicDraft;
  images: MediaItem[];
  setDraft: (d: ClassicDraft | null) => void;
  displays: DisplayItem[];
  onSaved: (message: string) => void;
  onError: (message: string) => void;
  previewSrc?: string;
  readOnly?: boolean;
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
  const baseline = useRef({ name: draft.name, template: draft.template, content: draft.content, displayIds: draft.displayIds });
  const c = draft.content;
  const update = (content: MenuContent) => setDraft({ ...draft, content });
  const totalItems = c.sections.reduce((n, s) => n + s.items.length, 0);
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
    const run = async () => {
      try {
        const token = await authToken();
        if (cancelled) return;
        const res = await fetch("/api/menus/preview", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ template: draft.template, content: draft.content }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setPreviewError(body.error || "Preview unavailable.");
            setPreviewLoading(false);
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
        setPreview(url);
        setPreviewError(null);
        setPreviewLoading(false);
      } catch {
        if (!cancelled) {
          setPreviewError("Preview unavailable.");
          setPreviewLoading(false);
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
      };
    }
    const timer = window.setTimeout(() => { void run(); }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft.template, draft.content, readOnly, previewSrc]);

  useEffect(() => () => {
    if (last.current) URL.revokeObjectURL(last.current);
  }, []);

  function selectRegion(id: "menu" | "photo") {
    setRegion(id);
    setStep(id === "photo" ? "photo" : "content");
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
    setBusy(true);
    try {
      const body = JSON.stringify({ name: draft.name, template: draft.template, content: draft.content, ...(draft.displayIds.length ? { displayIds: draft.displayIds } : {}) });
      const res = draft.id
        ? await api<{ published?: boolean }>(`/api/menus/${draft.id}`, { method: "PATCH", body })
        : await api<{ published?: boolean; warning?: string }>("/api/menus", { method: "POST", body });
      const warning = (res as { warning?: string }).warning;
      if (warning) onError(warning);
      onSaved(draft.id ? "Menu updated. Screens showing it refresh within a minute." : draft.displayIds.length ? "Menu board created and sent to your screens" : "Menu board created. It's in your media and playlists.");
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
        ) : (
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
      </div>
    );
  }

  const editingLabel = region && (step === "content" || step === "photo") ? (
    <p className="text-sm font-medium">Editing: {region === "photo" ? "Photo" : "Menu"}</p>
  ) : null;

  const contentPanel = (
    <details className="studio-panel" open>
      <summary className="studio-panel-summary">Content &amp; text</summary>
      {editingLabel}
      <div id="menu-selected-editor" ref={editorRef} data-testid="menu-selected-editor" className="grid gap-3">
        <label className="grid gap-1"><span className="form-label">Title on screen</span>
          <input className="field" value={c.title} maxLength={MENU_LIMITS.title} onChange={(e) => update({ ...c, title: e.target.value })} /></label>
        <label className="grid gap-1"><span className="form-label">Subtitle</span>
          <input className="field" value={c.subtitle} maxLength={MENU_LIMITS.subtitle} onChange={(e) => update({ ...c, subtitle: e.target.value })} /></label>
        {c.sections.map((section, si) => (
          <section key={si} className="section-card" aria-labelledby={`classic-section-${si}`}>
            <div className="section-card-head">
              <h3 id={`classic-section-${si}`} className="section-card-legend">Section {si + 1}</h3>
              <button type="button" className="section-remove" aria-label={`Remove section ${si + 1}`}
                onClick={() => update({ ...c, sections: c.sections.filter((_, i) => i !== si) })}>Remove</button>
            </div>
            <input className="field" aria-label={`Section ${si + 1} name`} placeholder="e.g. Tacos" value={section.name} maxLength={MENU_LIMITS.sectionName}
              onChange={(e) => update({ ...c, sections: c.sections.map((s, i) => i === si ? { ...s, name: e.target.value } : s) })} />
            {section.items.map((item, ii) => {
              const setItem = (patch: Partial<typeof item>) => update({ ...c, sections: c.sections.map((s, i) => i === si ? { ...s, items: s.items.map((it, j) => j === ii ? { ...it, ...patch } : it) } : s) });
              return (
                <div key={ii} className="item-card">
                  <input className="item-name" aria-label={`Item ${ii + 1} in section ${si + 1}`} placeholder="Item" value={item.name} maxLength={MENU_LIMITS.itemName} onChange={(e) => setItem({ name: e.target.value })} />
                  <input className="item-price" aria-label={`Price ${ii + 1} in section ${si + 1}`} placeholder="$0.00" value={item.price} maxLength={MENU_LIMITS.price} onChange={(e) => setItem({ price: e.target.value })} />
                  <button type="button" className="item-remove" aria-label={`Remove item ${ii + 1} in section ${si + 1}`}
                    onClick={() => update({ ...c, sections: c.sections.map((s, i) => i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s) })}>
                    <span aria-hidden="true">×</span>
                  </button>
                  <input className="item-desc" aria-label={`Description ${ii + 1} in section ${si + 1}`} placeholder="Short description (optional)" value={item.description} maxLength={MENU_LIMITS.description} onChange={(e) => setItem({ description: e.target.value })} />
                </div>
              );
            })}
            {section.items.length < MENU_LIMITS.itemsPerSection && totalItems < MENU_LIMITS.items ? (
              <button type="button" className="btn btn-quiet item-add" onClick={() => update({ ...c, sections: c.sections.map((s, i) => i === si ? { ...s, items: [...s.items, blankItem()] } : s) })}>Add item</button>
            ) : null}
          </section>
        ))}
        {c.sections.length < MENU_LIMITS.sections ? (
          <button type="button" className="btn btn-quiet justify-self-start min-h-11" onClick={() => update({ ...c, sections: [...c.sections, { name: "", items: [blankItem()] }] })}>Add section</button>
        ) : null}
        <label className="grid gap-1"><span className="form-label">Footer</span>
          <input className="field" value={c.footer} maxLength={MENU_LIMITS.footer} onChange={(e) => update({ ...c, footer: e.target.value })} /></label>
      </div>
    </details>
  );

  const photoPanel = (
    <details className="studio-panel" open={step === "photo" || hasPhoto}>
      <summary className="studio-panel-summary">Photo</summary>
      {editingLabel}
      <label className="grid gap-1"><span className="form-label">Photo (optional)</span>
        <select className="field" value={c.photoMediaId ?? ""} onChange={(e) => { update({ ...c, photoMediaId: e.target.value || null }); if (e.target.value) selectRegion("photo"); }}>
          <option value="">No photo</option>
          {images.map((m) => <option key={m.id} value={m.id}>{m.fileName}</option>)}
        </select>
        <span className="text-xs text-muted">{images.length ? "Shows on the right side of the menu. JPG or PNG from your media." : "Upload a JPG or PNG to your media to add a photo."}</span>
      </label>
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
          <div className={step === "photo" ? "studio-pane on" : "studio-pane"} data-step="template">
            {photoPanel}
          </div>
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
