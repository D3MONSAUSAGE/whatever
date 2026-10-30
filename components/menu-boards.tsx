"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, authToken, timeAgo, useApi, type DisplayItem } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/ui";
import { IconImage } from "@/components/icons";
import { MENU_LIMITS, MENU_TEMPLATES, sampleMenu, type MenuContent, type MenuTemplate } from "@/lib/menu-templates";

export type MenuBoard = {
  id: string; name: string; template: MenuTemplate; content: MenuContent;
  mediaId: string | null; playlistId: string | null; imageUrl: string | null; createdAt: string; updatedAt: string;
};

type Draft = { id: string | null; name: string; template: MenuTemplate; content: MenuContent; displayIds: string[] };

const blankItem = () => ({ name: "", price: "", description: "" });

export function MenuBoards() {
  const menus = useApi<{ menus: MenuBoard[]; available: boolean }>("/api/menus");
  const displays = useApi<DisplayItem[]>("/api/displays");
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
      </PageHeader>

      {draft ? (
        <Editor
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
    </section>
  );
}

function Editor({ draft, setDraft, displays, onSaved, onError }: {
  draft: Draft;
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
