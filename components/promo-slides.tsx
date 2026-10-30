"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, authToken, timeAgo, useApi, type MediaItem } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/ui";
import { IconImage } from "@/components/icons";
import { artImages, type MenuBoard } from "@/components/menu-boards";
import { PROMO_LIMITS, PROMO_TEMPLATES, samplePromo, type PromoContent, type PromoTemplate } from "@/lib/promo-templates";

export type Promo = {
  id: string; name: string; template: PromoTemplate; content: PromoContent | null; mediaId: string | null; imageUrl: string | null;
  startsOn: string | null; endsOn: string | null; menuId: string | null; placement: "none" | "added" | "scheduled";
  expired: boolean; updatedAt: string; screens?: { id: string; name: string }[];
};
type Draft = { id: string | null; name: string; template: PromoTemplate; content: PromoContent; startsOn: string; endsOn: string };

function dateText(p: { startsOn: string | null; endsOn: string | null }) {
  if (p.startsOn && p.endsOn) return `${p.startsOn} to ${p.endsOn}`;
  if (p.startsOn) return `from ${p.startsOn}`;
  if (p.endsOn) return `until ${p.endsOn}`;
  return "no end date";
}

export function PromoSlides() {
  const promos = useApi<{ promos: Promo[]; available: boolean }>("/api/promos");
  const menus = useApi<{ menus: MenuBoard[]; available: boolean }>("/api/menus");
  const media = useApi<MediaItem[]>("/api/media");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState<Record<string, string>>({});
  const toast = useToast();
  const confirm = useConfirm();
  const menuList = menus.data?.menus ?? [];

  function startNew(template: PromoTemplate = "happy") {
    setDraft({ id: null, name: PROMO_TEMPLATES.find((t) => t.id === template)!.name, template, content: samplePromo(template), startsOn: "", endsOn: "" });
  }

  async function addToMenu(promo: Promo) {
    const menuId = target[promo.id] ?? menuList[0]?.id;
    if (!menuId) return;
    setBusy(promo.id);
    try {
      const res = await api<{ mode: "added" | "scheduled"; screens: number }>(`/api/promos/${promo.id}/menu`, { method: "POST", body: JSON.stringify({ menuId }) });
      const menuName = menuList.find((m) => m.id === menuId)?.name ?? "the menu";
      toast.show(res.mode === "added"
        ? `Added to ${menuName}. ${res.screens ? "Screens showing it refresh within a minute." : "It plays wherever that menu is shown."}`
        : res.screens
          ? `Scheduled on ${res.screens} screen${res.screens === 1 ? "" : "s"} showing ${menuName}, ${dateText(promo)}.`
          : `Scheduled with ${menuName}, ${dateText(promo)}. It starts on any screen you switch to that menu.`);
      await promos.reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  async function takeOff(promo: Promo) {
    setBusy(promo.id);
    try {
      await api(`/api/promos/${promo.id}/menu`, { method: "DELETE" });
      toast.show("Taken off the menu. The menu keeps playing.");
      await promos.reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  async function remove(promo: Promo) {
    const ok = await confirm.ask({
      title: "Delete this promo?",
      body: `Delete “${promo.name}”? It comes off its menu. The image stays in your media library.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/promos/${promo.id}`, { method: "DELETE" });
      await promos.reload();
      toast.show("Promo deleted");
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }

  return (
    <section>
      <PageHeader
        title="Promos & specials"
        eyebrow="Media"
        icon={<IconImage />}
        lede="Make a happy hour, deal, or today's special slide in your brand colours, then add it to a menu board with one tap. Set dates and it shows up and comes down on its own."
      >
        {!draft ? <button className="btn btn-primary" onClick={() => startNew()}>New promo</button> : null}
        <Link href="/dashboard/media/menus" className="btn btn-quiet">Menu boards</Link>
      </PageHeader>

      {draft ? (
        <PromoEditor
          draft={draft}
          setDraft={setDraft}
          images={artImages(media.data)}
          onSaved={async (message) => { setDraft(null); await promos.reload(); toast.show(message); }}
          onError={(message) => toast.show(message, true)}
        />
      ) : null}

      {promos.error ? <p className="text-danger" role="alert">{promos.error}</p> : null}
      {!promos.data && !promos.error ? <LoadingBlock /> : null}
      {promos.data && !promos.data.available ? (
        <EmptyState title="Promos are on their way">They switch on with the next update.</EmptyState>
      ) : null}
      {promos.data?.available && promos.data.promos.length === 0 && !draft ? (
        <EmptyState title="No promos yet">Choose “New promo” to make a happy hour, deal or special.</EmptyState>
      ) : null}
      {promos.data?.promos.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Promos">
          {promos.data.promos.map((p) => {
            const menuName = menuList.find((m) => m.id === p.menuId)?.name;
            return (
              <li key={p.id} className="card overflow-hidden">
                <div className="aspect-video bg-ink">
                  {p.imageUrl ? <img src={p.imageUrl} alt={`${p.name} preview`} className="w-full h-full object-cover" /> : null}
                </div>
                <div className="p-4 grid gap-2">
                  <div>
                    <p className="font-semibold break-words">{p.name}</p>
                    <p className="text-sm text-muted">{PROMO_TEMPLATES.find((t) => t.id === p.template)?.name} · {dateText(p)} · updated {timeAgo(p.updatedAt)}</p>
                    <p className="text-sm" data-testid="promo-status">
                      {p.expired ? "Ended. " : ""}
                      {p.placement === "added" ? `On ${menuName ?? "a menu"}` : p.placement === "scheduled" ? `Scheduled with ${menuName ?? "a menu"}` : "Not on a menu yet"}
                    </p>
                    {p.placement !== "none" ? (
                      <p className="text-sm text-muted" data-testid="promo-screens">
                        {(p.screens ?? []).length
                          ? `${p.placement === "scheduled" ? `Plays ${dateText(p)} on` : "Playing on"}: ${(p.screens ?? []).map((d) => d.name).join(", ")}`
                          : `No screen shows ${menuName ?? "this menu"} yet. It starts on any screen you switch to it.`}
                      </p>
                    ) : null}
                  </div>
                  {p.placement === "none" ? (
                    menuList.length ? (
                      <div className="flex flex-wrap gap-2 items-center">
                        {menuList.length > 1 ? (
                          <select className="field" aria-label={`Menu for ${p.name}`} value={target[p.id] ?? menuList[0].id} onChange={(e) => setTarget({ ...target, [p.id]: e.target.value })}>
                            {menuList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        ) : null}
                        <button className="btn btn-primary" disabled={busy === p.id} onClick={() => addToMenu(p)}>
                          {busy === p.id ? "Adding…" : `Add to ${menuList.length > 1 ? "menu" : menuList[0].name}`}
                        </button>
                      </div>
                    ) : <p className="text-sm text-muted"><Link className="underline" href="/dashboard/media/menus">Make a menu board</Link> to add this promo to.</p>
                  ) : (
                    <button className="btn btn-quiet justify-self-start" disabled={busy === p.id} onClick={() => takeOff(p)}>Take off menu</button>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-quiet" onClick={() => p.content && setDraft({ id: p.id, name: p.name, template: p.template, content: p.content, startsOn: p.startsOn ?? "", endsOn: p.endsOn ?? "" })}>Edit</button>
                    <button className="btn btn-quiet text-danger" onClick={() => remove(p)}>Delete</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function PromoEditor({ draft, setDraft, images, onSaved, onError }: {
  draft: Draft; setDraft: (d: Draft | null) => void; images: MediaItem[];
  onSaved: (message: string) => void; onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  const c = draft.content;
  const update = (content: PromoContent) => setDraft({ ...draft, content });

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const token = await authToken();
        const res = await fetch("/api/promos/preview", {
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
      const body = JSON.stringify({ name: draft.name, template: draft.template, content: draft.content, startsOn: draft.startsOn || null, endsOn: draft.endsOn || null });
      if (draft.id) await api(`/api/promos/${draft.id}`, { method: "PATCH", body });
      else await api("/api/promos", { method: "POST", body });
      onSaved(draft.id ? "Promo updated. Screens showing it refresh within a minute." : "Promo created. Add it to a menu to put it on your screens.");
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof PROMO_LIMITS & keyof PromoContent, label: string, placeholder = "") => (
    <label className="grid gap-1"><span className="form-label">{label}</span>
      <input className="field" value={String(c[key] ?? "")} placeholder={placeholder} maxLength={PROMO_LIMITS[key]} onChange={(e) => update({ ...c, [key]: e.target.value })} /></label>
  );

  return (
    <div className="card p-4 md:p-6 mb-6" data-testid="promo-editor">
      <h2 className="text-lg font-semibold">{draft.id ? "Edit promo" : "New promo"}</h2>
      <fieldset className="mt-4">
        <legend className="form-label">Template</legend>
        <div className="grid gap-3 sm:grid-cols-3 mt-1">
          {PROMO_TEMPLATES.map((t) => (
            <label key={t.id} className={`rounded-xl border p-3 cursor-pointer ${draft.template === t.id ? "border-primary ring-2 ring-primary/30" : "border-line"}`}>
              <input type="radio" name="promo-template" className="sr-only" checked={draft.template === t.id}
                onChange={() => setDraft({ ...draft, template: t.id, ...(draft.id ? {} : { content: { ...samplePromo(t.id), photoMediaId: c.photoMediaId, useBrand: c.useBrand }, name: t.name }) })} />
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
          <label className="grid gap-1"><span className="form-label">Promo name (only you see this)</span>
            <input className="field" value={draft.name} maxLength={PROMO_LIMITS.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          {field("tag", "Label", "e.g. Happy hour")}
          {field("headline", "Headline")}
          {field("subheadline", "Subheadline")}
          {field("price", "Price", "e.g. $5")}
          {field("details", "Details")}
          {field("footer", "Bottom line", "e.g. 4–7 PM")}
          <label className="grid gap-1"><span className="form-label">Photo (optional)</span>
            <select className="field" value={c.photoMediaId ?? ""} onChange={(e) => update({ ...c, photoMediaId: e.target.value || null })}>
              <option value="">No photo</option>
              {images.map((m) => <option key={m.id} value={m.id}>{m.fileName}</option>)}
            </select></label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.useBrand !== false} onChange={(e) => update({ ...c, useBrand: e.target.checked })} />
            Use my brand (logo and colours)
          </label>
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="form-label">Dates (optional)</legend>
            <label className="grid gap-1 text-sm">Starts
              <input type="date" className="field" value={draft.startsOn} onChange={(e) => setDraft({ ...draft, startsOn: e.target.value })} /></label>
            <label className="grid gap-1 text-sm">Ends
              <input type="date" className="field" value={draft.endsOn} onChange={(e) => setDraft({ ...draft, endsOn: e.target.value })} /></label>
            <p className="col-span-2 text-xs text-muted">With dates, the promo shows only on those days (in each screen&apos;s time zone). Breakfast, lunch and dinner times still take priority. Leave blank to keep it on until you take it off.</p>
          </fieldset>
        </div>
        <div className="grid gap-3 content-start">
          <p className="form-label">Preview</p>
          <div className="tv">
            {preview ? <img src={preview} alt="Promo preview" data-testid="promo-preview" className="w-full h-full object-contain" /> : null}
          </div>
          {previewError ? <p className="text-sm text-danger" role="alert">{previewError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : draft.id ? "Save changes" : "Create promo"}</button>
            <button className="btn btn-quiet" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
