"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, authToken, timeAgo, useApi, type DisplayItem, type MediaItem } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/ui";
import { IconImage } from "@/components/icons";
import { DEFAULT_BRAND, MENU_LIMITS, MENU_TEMPLATES, normalizeHex, sampleMenu, type MenuContent, type MenuTemplate } from "@/lib/menu-templates";

export type Brand = { primaryColor: string; accentColor: string; logoMediaId: string | null; available: boolean; custom: boolean };

/** JPG or PNG images that can go on a menu (logos and photos). Menu slides themselves are left out. */
export function artImages(media: MediaItem[] | null | undefined) {
  return (media ?? []).filter((m) => m.kind !== "video" && /\.(png|jpe?g)$/i.test(m.fileName) && !/\((menu|promo)\)\.png$/.test(m.fileName));
}

export type MenuBoard = {
  id: string; name: string; template: MenuTemplate; content: MenuContent;
  mediaId: string | null; playlistId: string | null; imageUrl: string | null; createdAt: string; updatedAt: string;
};

type Draft = { id: string | null; name: string; template: MenuTemplate; content: MenuContent; displayIds: string[] };

const blankItem = () => ({ name: "", price: "", description: "" });

export function MenuBoards() {
  const menus = useApi<{ menus: MenuBoard[]; available: boolean }>("/api/menus");
  const displays = useApi<DisplayItem[]>("/api/displays");
  const media = useApi<MediaItem[]>("/api/media");
  const [draft, setDraft] = useState<Draft | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  function startNew() {
    setDraft({ id: null, name: "Lunch menu", template: "classic", content: sampleMenu(), displayIds: [] });
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

  return (
    <section>
      <PageHeader
        title="Menu boards"
        eyebrow="Media"
        icon={<IconImage />}
        lede="Pick a template, type your items and prices, and Seemple makes a full-screen slide. Edit it any time and every screen showing it updates."
      >
        {!draft ? <button className="btn btn-primary" onClick={startNew}>New menu board</button> : null}
        <Link href="/dashboard/media" className="btn btn-quiet">Back to media</Link>
        <Link href="/dashboard/schedule#day-parts" className="btn btn-quiet">Breakfast, lunch &amp; dinner times</Link>
        <Link href="/dashboard/media/promos" className="btn btn-quiet">Promos &amp; specials</Link>
      </PageHeader>

      {!draft && menus.data?.available ? <BrandCard images={artImages(media.data)} onChanged={() => menus.reload()} /> : null}

      {draft ? (
        <Editor
          images={artImages(media.data)}
          draft={draft}
          setDraft={setDraft}
          displays={(displays.data ?? []).filter((d) => d.connected)}
          onSaved={async (message) => { setDraft(null); await menus.reload(); toast.show(message); }}
          onError={(message) => toast.show(message, true)}
        />
      ) : null}

      {menus.error ? <p className="text-danger" role="alert">{menus.error}</p> : null}
      {!menus.data && !menus.error ? <LoadingBlock /> : null}
      {menus.data && !menus.data.available ? (
        <EmptyState title="Menu boards are on their way">They switch on with the next update. Your other media works as usual.</EmptyState>
      ) : null}
      {menus.data?.available && menus.data.menus.length === 0 && !draft ? (
        <EmptyState title="No menu boards yet">Choose “New menu board” to make your first one in about a minute.</EmptyState>
      ) : null}
      {menus.data?.menus.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Menu boards">
          {menus.data.menus.map((menu) => (
            <li key={menu.id} className="card overflow-hidden">
              <div className="aspect-video bg-ink">
                {menu.imageUrl ? <img src={menu.imageUrl} alt={`${menu.name} preview`} className="w-full h-full object-cover" /> : null}
              </div>
              <div className="p-4">
                <p className="font-semibold break-words">{menu.name}</p>
                <p className="text-sm text-muted">{MENU_TEMPLATES.find((t) => t.id === menu.template)?.name ?? menu.template} · updated {timeAgo(menu.updatedAt)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn btn-quiet" onClick={() => setDraft({ id: menu.id, name: menu.name, template: menu.template, content: menu.content, displayIds: [] })}>Edit</button>
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

function Editor({ draft, setDraft, displays, images, onSaved, onError }: {
  draft: Draft;
  images: MediaItem[];
  setDraft: (d: Draft | null) => void;
  displays: DisplayItem[];
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  const c = draft.content;
  const update = (content: MenuContent) => setDraft({ ...draft, content });
  const totalItems = c.sections.reduce((n, s) => n + s.items.length, 0);

  useEffect(() => {
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
  }, [draft.template, draft.content]);

  async function save() {
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

  return (
    <div className="card p-4 md:p-6 mb-6" data-testid="menu-editor">
      <h2 className="text-lg font-semibold">{draft.id ? "Edit menu board" : "New menu board"}</h2>
      <fieldset className="mt-4">
        <legend className="form-label">Template</legend>
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

      <div className="grid gap-6 lg:grid-cols-2 mt-5">
        <div className="grid gap-3 content-start">
          <label className="grid gap-1"><span className="form-label">Menu name (only you see this)</span>
            <input className="field" value={draft.name} maxLength={MENU_LIMITS.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
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
          <label className="grid gap-1"><span className="form-label">Photo (optional)</span>
            <select className="field" value={c.photoMediaId ?? ""} onChange={(e) => update({ ...c, photoMediaId: e.target.value || null })}>
              <option value="">No photo</option>
              {images.map((m) => <option key={m.id} value={m.id}>{m.fileName}</option>)}
            </select>
            <span className="text-xs text-muted">{images.length ? "Shows on the right side of the menu. JPG or PNG from your media." : "Upload a JPG or PNG to your media to add a photo."}</span></label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.useBrand !== false} onChange={(e) => update({ ...c, useBrand: e.target.checked })} />
            Use my brand (logo and colours)
          </label>
        </div>

        <div className="grid gap-3 content-start">
          <p className="form-label">Preview</p>
          <div className="tv">
            {preview ? <img src={preview} alt="Menu board preview" data-testid="menu-preview" className="w-full h-full object-contain" /> : null}
          </div>
          {previewError ? <p className="text-sm text-danger" role="alert">{previewError}</p> : null}
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
            <button className="btn btn-quiet" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrandCard({ images, onChanged }: { images: MediaItem[]; onChanged?: () => void }) {
  const brand = useApi<Brand>("/api/brand");
  const [form, setForm] = useState<{ primaryColor: string; accentColor: string; logoMediaId: string | null } | null>(null);
  const [busy, setBusy] = useState<"save" | "apply" | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (brand.data && !form) setForm({ primaryColor: brand.data.primaryColor, accentColor: brand.data.accentColor, logoMediaId: brand.data.logoMediaId });
  }, [brand.data, form]);

  if (brand.error) return <p className="text-danger mb-4" role="alert">{brand.error}</p>;
  if (!brand.data || !form) return null;
  if (!brand.data.available) return null;
  const valid = Boolean(normalizeHex(form.primaryColor) && normalizeHex(form.accentColor));

  async function save() {
    setBusy("save");
    try {
      await api("/api/brand", { method: "PUT", body: JSON.stringify(form) });
      await brand.reload();
      toast.show("Brand saved. New menus use it. Choose “Apply to all menus and promos” to update the ones you have.");
    } catch (err) {
      toast.show((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  async function applyAll() {
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
      onChanged?.();
      toast.show(failed ? `Updated ${updated} slides. ${failed} couldn't be updated; try again.` : `Updated ${updated} slide${updated === 1 ? "" : "s"}. Screens refresh within a minute.`, failed > 0);
    } catch (err) {
      toast.show((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  const colour = (key: "primaryColor" | "accentColor", label: string) => (
    <label className="grid gap-1"><span className="form-label">{label}</span>
      <span className="flex gap-2 items-center">
        <input type="color" aria-label={`${label} picker`} className="h-10 w-12 rounded border border-line" value={normalizeHex(form[key]) ?? DEFAULT_BRAND[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
        <input className="field w-32" aria-label={label} value={form[key]} maxLength={7} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      </span>
    </label>
  );

  return (
    <section className="card p-4 md:p-6 mb-6" aria-labelledby="brand-heading" id="brand">
      <h2 id="brand-heading" className="text-lg font-semibold">Your brand</h2>
      <p className="text-sm text-muted">Your logo and colours go on every menu board that has “Use my brand” ticked.</p>
      <div className="mt-4 flex flex-wrap gap-4 items-end">
        <label className="grid gap-1"><span className="form-label">Logo</span>
          <select className="field" value={form.logoMediaId ?? ""} onChange={(e) => setForm({ ...form, logoMediaId: e.target.value || null })}>
            <option value="">No logo</option>
            {images.map((m) => <option key={m.id} value={m.id}>{m.fileName}</option>)}
          </select>
        </label>
        {colour("primaryColor", "Main colour")}
        {colour("accentColor", "Highlight colour")}
      </div>
      {!images.length ? <p className="text-xs text-muted mt-2">To add a logo, upload it as a JPG or PNG in Media first.</p> : null}
      {!valid ? <p className="text-sm text-danger mt-2" role="alert">Use colours like #0066ff.</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={!valid || busy !== null} onClick={save}>{busy === "save" ? "Saving…" : "Save brand"}</button>
        <button className="btn btn-quiet" disabled={!brand.data.custom || busy !== null} onClick={applyAll}>{busy === "apply" ? "Updating…" : "Apply to all menus and promos"}</button>
      </div>
    </section>
  );
}
