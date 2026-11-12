"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, authToken, timeAgo, useApi, type DisplayItem, type MediaItem } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { EmptyState, LoadState, PageHeader, LimitNote, atLimit } from "@/components/ui";
import { IconImage } from "@/components/icons";
import { MENU_LIMITS, MENU_TEMPLATES, sampleMenu, type MenuContent, type MenuTemplate } from "@/lib/menu-templates";
import { artImages, type Brand } from "@/lib/brand-kit";
import { BrandSummary, type BrandKitFixture } from "@/components/brand-kit";
import { LayoutStudio } from "@/components/layout-studio";
import { LayoutGallery } from "@/components/layout-gallery";
import type { AccountStudio } from "@/lib/layout-account";
import { type LayoutTemplate } from "@/lib/layout-studio";
import {
  LAYOUT_OPTIONS,
  classifyBoardContent,
  classicPreviewHits,
  layoutOptionById,
  layoutOptionForTemplate,
  parseUnifiedSearch,
  confirmDiscardUnsaved,
  hasUnsavedEdits,
  type LayoutOption,
} from "@/lib/menu-board-unify";

export type { Brand };
export { artImages };

export type MenuBoard = {
  id: string;
  name: string;
  template: string;
  content: unknown;
  mediaId: string | null;
  playlistId: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type ClassicDraft = { id: string | null; name: string; template: MenuTemplate; content: MenuContent; displayIds: string[] };

type View =
  | { mode: "list" }
  | { mode: "pick-layout"; screenId: string | null }
  | { mode: "classic"; draft: ClassicDraft; screenId: string | null }
  | { mode: "layout"; boardId: string | null; template: LayoutTemplate; screenId: string | null; zone?: string };

export type MenuFixture = {
  menus: MenuBoard[];
  available?: boolean;
  images?: MediaItem[];
  displays?: DisplayItem[];
  brand?: BrandKitFixture;
  startEditing?: boolean;
  startView?: "list" | "pick-layout";
  startLayout?: LayoutTemplate;
  startZone?: string;
  startBoardId?: string | null;
  previewSrc?: string;
  studio?: AccountStudio;
};

function newClassicDraft(displayIds: string[] = []): ClassicDraft {
  return { id: null, name: "Lunch menu", template: "classic", content: sampleMenu(), displayIds };
}

function boardKindLabel(menu: MenuBoard): string {
  const classified = classifyBoardContent(menu.template, menu.content);
  if (classified.kind === "layout") return layoutOptionForTemplate(classified.document.template).name;
  if (classified.kind === "classic") {
    return MENU_TEMPLATES.find((t) => t.id === classified.template)?.name ?? "Menu";
  }
  return "Menu board";
}

function openClassified(menu: MenuBoard, screenId: string | null): View | null {
  const classified = classifyBoardContent(menu.template, menu.content);
  if (classified.kind === "layout") {
    return { mode: "layout", boardId: menu.id, template: classified.document.template, screenId };
  }
  if (classified.kind === "classic") {
    return { mode: "classic", draft: { id: menu.id, name: menu.name, template: classified.template, content: classified.content, displayIds: [] }, screenId };
  }
  return null;
}

function initialView(fixture?: MenuFixture, search?: Record<string, string | string[] | undefined | null>): { view: View; pendingBoardId: string | null } {
  if (fixture?.startEditing) return { view: { mode: "classic", draft: newClassicDraft(), screenId: null }, pendingBoardId: null };
  if (fixture?.startLayout) {
    return {
      view: { mode: "layout", boardId: fixture.startBoardId ?? null, template: fixture.startLayout, screenId: null, zone: fixture.startZone },
      pendingBoardId: null,
    };
  }
  if (fixture?.startView === "pick-layout") return { view: { mode: "pick-layout", screenId: null }, pendingBoardId: null };
  const parsed = parseUnifiedSearch(search ?? {});
  const screenId = parsed.screenId;
  if (parsed.boardId) {
    return { view: { mode: "list" }, pendingBoardId: parsed.boardId };
  }
  if (parsed.layout) {
    const option = layoutOptionById(parsed.layout);
    if (option?.kind === "classic") return { view: { mode: "classic", draft: newClassicDraft(screenId ? [screenId] : []), screenId }, pendingBoardId: null };
    if (option?.layoutTemplate) return { view: { mode: "layout", boardId: null, template: option.layoutTemplate, screenId }, pendingBoardId: null };
  }
  if (parsed.isNew) return { view: { mode: "pick-layout", screenId }, pendingBoardId: null };
  return { view: { mode: "list" }, pendingBoardId: null };
}

export function MenuBoards({
  fixture,
  initialSearch,
  studioEnabled = true,
}: {
  fixture?: MenuFixture;
  initialSearch?: Record<string, string | string[] | undefined | null>;
  studioEnabled?: boolean;
}) {
  const liveMenus = useApi<{ menus: MenuBoard[]; available: boolean }>(fixture ? null : "/api/menus");
  const liveDisplays = useApi<DisplayItem[]>(fixture ? null : "/api/displays");
  const liveMedia = useApi<MediaItem[]>(fixture ? null : "/api/media");
  const menus = fixture ? { data: { menus: fixture.menus, available: fixture.available !== false }, error: null, reload: async () => {} } : liveMenus;
  const displays = fixture ? { data: fixture.displays ?? [] } : liveDisplays;
  const media = fixture ? { data: fixture.images ?? [] } : liveMedia;
  const started = initialView(fixture, initialSearch);
  const [view, setView] = useState<View>(started.view);
  const [pendingBoardId, setPendingBoardId] = useState<string | null>(started.pendingBoardId);
  const [selectedLayout, setSelectedLayout] = useState<LayoutOption | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const draftOpen = view.mode === "classic" || view.mode === "layout" || view.mode === "pick-layout";

  useEffect(() => {
    if (!pendingBoardId || !menus.data?.menus) return;
    const menu = menus.data.menus.find((item) => item.id === pendingBoardId);
    if (!menu) return;
    const next = openClassified(menu, parseUnifiedSearch(initialSearch ?? {}).screenId);
    if (next) setView(next);
    setPendingBoardId(null);
  }, [menus.data, pendingBoardId, initialSearch]);

  function startNew() {
    if (studioEnabled) { setSelectedLayout(null); setView({ mode: "pick-layout", screenId: parseUnifiedSearch(initialSearch ?? {}).screenId }); }
    else setView({ mode: "classic", draft: newClassicDraft(), screenId: null });
  }

  function pickOption(option: LayoutOption, screenId: string | null) {
    if (option.kind === "classic") {
      setView({ mode: "classic", draft: newClassicDraft(screenId ? [screenId] : []), screenId });
      return;
    }
    if (option.layoutTemplate) {
      setView({ mode: "layout", boardId: null, template: option.layoutTemplate, screenId });
    }
  }

  function editMenu(menu: MenuBoard) {
    const next = openClassified(menu, parseUnifiedSearch(initialSearch ?? {}).screenId);
    if (next) setView(next);
    else toast.show("This board could not be opened.", true);
  }

  async function remove(menu: MenuBoard) {
    const ok = await confirm.ask({
      title: "Delete this menu board?",
      body: `Delete “${menu.name}”? Screens keep showing its last image until you change them. The image and playlist stay in your library.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/menus/${menu.id}`, { method: "DELETE" });
      await menus.reload();
      toast.show("Menu board deleted");
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }

  const pickerOptions = studioEnabled ? LAYOUT_OPTIONS : LAYOUT_OPTIONS.filter((item) => item.kind === "classic");

  return (
    <section>
      {draftOpen ? null : (
        <>
          <PageHeader
            title="Menu boards"
            eyebrow="Media"
            icon={<IconImage />}
            lede="Pick a layout, fill each area, and Pekko makes a full-screen slide. Every menu board you already have stays in this list, and you can edit it any time."
            action={<button type="button" className="btn btn-primary" onClick={startNew} disabled={atLimit(menus.data?.menus.length, 100)}>New menu board</button>}
          />
          <p className="text-sm text-muted mb-4">
            <Link href="/dashboard/schedule#day-parts" className="font-semibold text-primary underline underline-offset-4">Breakfast, lunch &amp; dinner times</Link>
            {" · "}
            <Link href="/dashboard/account/brand-kit" className="font-semibold text-primary underline underline-offset-4">Brand Kit</Link>
          </p>
        </>
      )}

      {!draftOpen && menus.data?.available ? <BrandSummary fixture={fixture?.brand} /> : null}

      {view.mode === "pick-layout" ? (
        <LayoutGallery
          options={pickerOptions}
          selectedId={selectedLayout?.id ?? null}
          onSelect={setSelectedLayout}
          onContinue={(option) => { setSelectedLayout(option); pickOption(option, view.screenId); }}
          onCancel={() => { setSelectedLayout(null); setView({ mode: "list" }); }}
        />
      ) : null}

      {view.mode === "classic" ? (
        <Editor
          images={artImages(media.data)}
          draft={view.draft}
          setDraft={(draft) => { if (!draft) setView({ mode: "list" }); else setView({ ...view, draft }); }}
          displays={(displays.data ?? []).filter((d) => d.connected)}
          onSaved={async (message) => { setView({ mode: "list" }); await menus.reload(); toast.show(message); }}
          onError={(message) => toast.show(message, true)}
          previewSrc={fixture?.previewSrc}
          readOnly={Boolean(fixture)}
        />
      ) : null}

      {view.mode === "layout" ? (
        <LayoutStudio
          key={view.boardId ?? `new-${view.template}`}
          mode="account"
          fixture={fixture?.studio ?? null}
          screenId={view.screenId}
          screenOnline={(displays.data ?? []).find((item) => item.id === view.screenId)?.online}
          screenConnected={(displays.data ?? []).find((item) => item.id === view.screenId)?.connected}
          initialBoardId={view.boardId}
          initialTemplate={view.boardId ? null : view.template}
          initialZone={view.zone}
          embedded
          brand={fixture?.brand}
          onClose={() => setView({ mode: "list" })}
        />
      ) : null}

      <LimitNote count={menus.data?.menus.length} max={100} noun="menu boards" />
      {menus.data && menus.error ? <p className="text-danger" role="alert">{menus.error}</p> : null}
      {!menus.data ? <LoadState error={menus.error} /> : null}
      {menus.data && !menus.data.available ? (
        <EmptyState title="Menu boards are on their way">They switch on with the next update. Your other media works as usual.</EmptyState>
      ) : null}
      {menus.data?.available && menus.data.menus.length === 0 && !draftOpen ? (
        <EmptyState title="No menu boards yet">Choose “New menu board” to make your first one in about a minute.</EmptyState>
      ) : null}
      {menus.data?.menus.length && view.mode === "list" ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Menu boards" data-testid="unify-list">
          {menus.data.menus.map((menu) => (
            <li key={menu.id} className="card overflow-hidden">
              <div className="relative aspect-video bg-ink">
                {menu.imageUrl ? <img src={menu.imageUrl} alt={`${menu.name} preview`} referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-contain" /> : null}
              </div>
              <div className="p-4">
                <p className="font-semibold break-words">{menu.name}</p>
                <p className="text-sm text-muted">{boardKindLabel(menu)} · updated {timeAgo(menu.updatedAt)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn btn-quiet" onClick={() => editMenu(menu)}>Edit</button>
                  <button className="btn btn-quiet text-danger" onClick={() => remove(menu)}>Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {confirm.node}
    </section>
  );
}

function Editor({ draft, setDraft, displays, images, onSaved, onError, previewSrc, readOnly }: {
  draft: ClassicDraft;
  images: MediaItem[];
  setDraft: (d: ClassicDraft | null) => void;
  displays: DisplayItem[];
  onSaved: (message: string) => void;
  onError: (message: string) => void;
  previewSrc?: string;
  readOnly?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(previewSrc ?? null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [region, setRegion] = useState<"menu" | "photo">("menu");
  const last = useRef<string | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const baseline = useRef({ name: draft.name, template: draft.template, content: draft.content, displayIds: draft.displayIds });
  const c = draft.content;
  const update = (content: MenuContent) => setDraft({ ...draft, content });
  const totalItems = c.sections.reduce((n, s) => n + s.items.length, 0);
  const hasPhoto = Boolean(c.photoMediaId);
  const hits = classicPreviewHits(hasPhoto);

  useEffect(() => {
    if (readOnly) {
      if (previewSrc) setPreview(previewSrc);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const token = await authToken();
        const res = await fetch("/api/menus/preview", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ template: draft.template, content: draft.content }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setPreviewError(body.error || "Preview unavailable.");
          return;
        }
        const url = URL.createObjectURL(await res.blob());
        if (last.current) URL.revokeObjectURL(last.current);
        last.current = url;
        setPreview(url);
        setPreviewError(null);
      } catch {
        setPreviewError("Preview unavailable.");
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft.template, draft.content, readOnly, previewSrc]);

  function selectRegion(id: "menu" | "photo") {
    setRegion(id);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 860px)").matches) {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function requestClose() {
    const current = { name: draft.name, template: draft.template, content: draft.content, displayIds: draft.displayIds };
    if (!confirmDiscardUnsaved(hasUnsavedEdits(current, baseline.current))) return;
    setDraft(null);
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

  return (
    <div className="card p-4 md:p-6 mb-6" data-testid="menu-editor">
      <h1 className="text-lg font-semibold">{draft.id ? "Edit menu board" : "New menu board"}</h1>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,400px)] mt-5">
        <div className="grid gap-3 content-start lg:order-2 lg:sticky lg:top-20 self-start">
          <p className="form-label">Preview</p>
          <p className="text-xs text-muted -mt-2">This is a preview of the board, not a live feed from the TV.</p>
          <div className="tv relative" style={{ aspectRatio: "16 / 9" }} data-testid="classic-preview-sticky">
            {preview ? <img src={preview} alt="Menu board preview" data-testid="menu-preview" className="w-full h-full object-contain" /> : null}
            {hits.map((hit) => (
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
            ))}
          </div>
          {previewError ? <p className="text-sm text-danger" role="alert">{previewError}</p> : null}
          {region ? <p className="text-sm font-medium">Editing: {region === "photo" ? "Photo" : "Menu"}</p> : null}
        </div>

        <div className="grid gap-3 content-start lg:order-1">
          <div id="menu-selected-editor" ref={editorRef} data-testid="menu-selected-editor">
            {region === "menu" ? (
              <div className="grid gap-3">
                <label className="grid gap-1"><span className="form-label">Title on screen</span>
                  <input className="field" value={c.title} maxLength={MENU_LIMITS.title} onChange={(e) => update({ ...c, title: e.target.value })} /></label>
                <label className="grid gap-1"><span className="form-label">Subtitle</span>
                  <input className="field" value={c.subtitle} maxLength={MENU_LIMITS.subtitle} onChange={(e) => update({ ...c, subtitle: e.target.value })} /></label>
                {c.sections.map((section, si) => (
                  <fieldset key={si} className="rounded-xl border border-line p-3 grid gap-2">
                    <legend className="px-1 text-sm font-semibold">Section {si + 1}</legend>
                    <div className="flex gap-2">
                      <input className="field flex-1" aria-label={`Section ${si + 1} name`} placeholder="e.g. Tacos" value={section.name} maxLength={MENU_LIMITS.sectionName}
                        onChange={(e) => update({ ...c, sections: c.sections.map((s, i) => i === si ? { ...s, name: e.target.value } : s) })} />
                      <button type="button" className="btn btn-quiet" onClick={() => update({ ...c, sections: c.sections.filter((_, i) => i !== si) })}>Remove section</button>
                    </div>
                    {section.items.map((item, ii) => {
                      const setItem = (patch: Partial<typeof item>) => update({ ...c, sections: c.sections.map((s, i) => i === si ? { ...s, items: s.items.map((it, j) => j === ii ? { ...it, ...patch } : it) } : s) });
                      return (
                        <div key={ii} className="grid grid-cols-[1fr_6.5rem_auto] gap-2">
                          <input className="field" aria-label={`Item ${ii + 1} in section ${si + 1}`} placeholder="Item" value={item.name} maxLength={MENU_LIMITS.itemName} onChange={(e) => setItem({ name: e.target.value })} />
                          <input className="field" aria-label={`Price ${ii + 1} in section ${si + 1}`} placeholder="$0.00" value={item.price} maxLength={MENU_LIMITS.price} onChange={(e) => setItem({ price: e.target.value })} />
                          <button type="button" className="btn btn-quiet" aria-label={`Remove item ${ii + 1} in section ${si + 1}`}
                            onClick={() => update({ ...c, sections: c.sections.map((s, i) => i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s) })}>×</button>
                          <input className="field col-span-2 text-sm" aria-label={`Description ${ii + 1} in section ${si + 1}`} placeholder="Short description (optional)" value={item.description} maxLength={MENU_LIMITS.description} onChange={(e) => setItem({ description: e.target.value })} />
                        </div>
                      );
                    })}
                    {section.items.length < MENU_LIMITS.itemsPerSection && totalItems < MENU_LIMITS.items ? (
                      <button type="button" className="btn btn-quiet justify-self-start" onClick={() => update({ ...c, sections: c.sections.map((s, i) => i === si ? { ...s, items: [...s.items, blankItem()] } : s) })}>Add item</button>
                    ) : null}
                  </fieldset>
                ))}
                {c.sections.length < MENU_LIMITS.sections ? (
                  <button type="button" className="btn btn-quiet justify-self-start" onClick={() => update({ ...c, sections: [...c.sections, { name: "", items: [blankItem()] }] })}>Add section</button>
                ) : null}
                <label className="grid gap-1"><span className="form-label">Footer</span>
                  <input className="field" value={c.footer} maxLength={MENU_LIMITS.footer} onChange={(e) => update({ ...c, footer: e.target.value })} /></label>
              </div>
            ) : null}
            {region === "photo" ? (
              <label className="grid gap-1"><span className="form-label">Photo</span>
                <select className="field" value={c.photoMediaId ?? ""} onChange={(e) => update({ ...c, photoMediaId: e.target.value || null })}>
                  <option value="">No photo</option>
                  {images.map((m) => <option key={m.id} value={m.id}>{m.fileName}</option>)}
                </select>
                <span className="text-xs text-muted">{images.length ? "Shows on the right side of the menu. JPG or PNG from your media." : "Upload a JPG or PNG to your media to add a photo."}</span></label>
            ) : null}
          </div>
          <h3 className="text-base font-semibold">General settings</h3>
          <fieldset>
            <legend className="form-label">Theme</legend>
            <div className="grid gap-3 sm:grid-cols-3 mt-1">
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
          <label className="grid gap-1"><span className="form-label">Menu name (only you see this)</span>
            <input className="field" value={draft.name} maxLength={MENU_LIMITS.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="grid gap-1"><span className="form-label">Photo (optional)</span>
            <select className="field" value={c.photoMediaId ?? ""} onChange={(e) => { update({ ...c, photoMediaId: e.target.value || null }); if (e.target.value) selectRegion("photo"); }}>
              <option value="">No photo</option>
              {images.map((m) => <option key={m.id} value={m.id}>{m.fileName}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.useBrand !== false} onChange={(e) => update({ ...c, useBrand: e.target.checked })} />
            Use my brand (logo and colours)
          </label>
          <p className="text-xs text-muted">Colours and the logo come from your <Link href="/dashboard/account/brand-kit" className="font-semibold text-primary underline underline-offset-4">Brand Kit</Link>. There is no separate brand form here.</p>
          {displays.length ? (
            <fieldset className="grid gap-1">
              <legend className="form-label">Show on these screens now (optional)</legend>
              {displays.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.displayIds.includes(d.id)}
                    onChange={(e) => setDraft({ ...draft, displayIds: e.target.checked ? [...draft.displayIds, d.id] : draft.displayIds.filter((x) => x !== d.id) })} />
                  {d.name}
                </label>
              ))}
              <p className="text-xs text-muted">Or leave these blank and use breakfast, lunch &amp; dinner times on the Schedule page.</p>
            </fieldset>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : draft.id ? "Save changes" : "Create menu board"}</button>
            <button className="btn btn-quiet" disabled={busy} onClick={requestClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
