"use client";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, authToken, timeAgo, useApi, type MediaItem } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { EmptyState, LoadState, PageHeader , LimitNote, atLimit } from "@/components/ui";
import { IconImage } from "@/components/icons";
import { artImages, type MenuBoard } from "@/components/menu-boards";
import { BrandSummary, type BrandKitFixture } from "@/components/brand-kit";
import { PROMO_LIMITS, PROMO_TEMPLATES, placeholderFields, samplePromo, type PromoContent, type PromoTemplate } from "@/lib/promo-templates";

export type Promo = {
  id: string; name: string; template: PromoTemplate; content: PromoContent | null; mediaId: string | null; imageUrl: string | null;
  startsOn: string | null; endsOn: string | null; menuId: string | null; placement: "none" | "added" | "scheduled";
  expired: boolean; updatedAt: string; screens?: { id: string; name: string }[];
};
type Draft = { id: string | null; name: string; template: PromoTemplate; content: PromoContent; startsOn: string; endsOn: string };

function dateText(p: { startsOn: string | null; endsOn: string | null }, t: T) {
  if (p.startsOn && p.endsOn) return t("ps.dateRange", { start: p.startsOn, end: p.endsOn });
  if (p.startsOn) return t("ps.dateFrom", { start: p.startsOn });
  if (p.endsOn) return t("ps.dateUntil", { end: p.endsOn });
  return t("ps.noEnd");
}

export type PromoFixture = {
  promos: Promo[];
  available?: boolean;
  menus?: MenuBoard[];
  images?: MediaItem[];
  brand?: BrandKitFixture;
  startEditing?: boolean;
  previewSrc?: string;
};

export function PromoSlides({ fixture, openNew = false, openPromoId = null }: { fixture?: PromoFixture; openNew?: boolean; openPromoId?: string | null } = {}) {
  const t = useT();
  const livePromos = useApi<{ promos: Promo[]; available: boolean }>(fixture ? null : "/api/promos");
  const liveMenus = useApi<{ menus: MenuBoard[]; available: boolean }>(fixture ? null : "/api/menus");
  const liveMedia = useApi<MediaItem[]>(fixture ? null : "/api/media");
  const promos = fixture ? { data: { promos: fixture.promos, available: fixture.available !== false }, error: null, reload: async () => {} } : livePromos;
  const menus = fixture ? { data: { menus: fixture.menus ?? [], available: true } } : liveMenus;
  const media = fixture ? { data: fixture.images ?? [] } : liveMedia;
  const [draft, setDraft] = useState<Draft | null>(() => (
    fixture?.startEditing || openNew
      ? { id: null, name: t("ptpl.happy.name"), template: "happy", content: samplePromo("happy"), startsOn: "", endsOn: "" }
      : null
  ));
  const openedPromo = useRef(false);
  useEffect(() => {
    if (openedPromo.current || fixture || !openPromoId || !promos.data?.promos) return;
    const match = promos.data.promos.find((item) => item.id === openPromoId);
    if (match?.content) {
      openedPromo.current = true;
      setDraft({ id: match.id, name: match.name, template: match.template, content: match.content, startsOn: match.startsOn ?? "", endsOn: match.endsOn ?? "" });
    }
  }, [fixture, openPromoId, promos.data]);
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState<Record<string, string>>({});
  const toast = useToast();
  const confirm = useConfirm();
  const menuList = menus.data?.menus ?? [];

  function startNew(template: PromoTemplate = "happy") {
    setDraft({ id: null, name: t(`ptpl.${template}.name`), template, content: samplePromo(template), startsOn: "", endsOn: "" });
  }

  async function addToMenu(promo: Promo) {
    const menuId = target[promo.id] ?? menuList[0]?.id;
    if (!menuId) return;
    setBusy(promo.id);
    try {
      const res = await api<{ mode: "added" | "scheduled"; screens: number }>(`/api/promos/${promo.id}/menu`, { method: "POST", body: JSON.stringify({ menuId }) });
      const menuName = menuList.find((m) => m.id === menuId)?.name ?? t("ps.theMenu");
      toast.show(res.mode === "added"
        ? `${t("ps.addedTo", { menu: menuName })} ${res.screens ? t("ps.refreshSoon") : t("ps.playsWherever")}`
        : res.screens
          ? t(res.screens === 1 ? "ps.schedOn" : "ps.schedOnMany", { n: res.screens, menu: menuName, dates: dateText(promo, t) })
          : t("ps.schedWith", { menu: menuName, dates: dateText(promo, t) }));
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
      toast.show(t("ps.takenOff"));
      await promos.reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  async function remove(promo: Promo) {
    const ok = await confirm.ask({
      title: t("ps.delTitle"),
      body: t("ps.delBody", { name: promo.name }),
      confirmLabel: t("ed.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/promos/${promo.id}`, { method: "DELETE" });
      await promos.reload();
      toast.show(t("ps.deleted"));
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }

  return (
    <section>
      <PageHeader
        title={t("ps.title")}
        eyebrow={t("ps.eyebrow")}
        icon={<IconImage />}
        lede={t("ps.lede")}
        action={!draft ? <button type="button" className="btn btn-primary" onClick={() => startNew()} disabled={atLimit(promos.data?.promos.length, 100)}>{t("ps.new")}</button> : undefined}
      />

      {!draft ? <BrandSummary fixture={fixture?.brand} /> : null}

      {draft ? (
        <PromoEditor
          draft={draft}
          setDraft={setDraft}
          images={artImages(media.data)}
          onSaved={async (message) => { setDraft(null); await promos.reload(); toast.show(message); }}
          onError={(message) => toast.show(message, true)}
          previewSrc={fixture?.previewSrc}
          readOnly={Boolean(fixture)}
        />
      ) : null}

      <LimitNote count={promos.data?.promos.length} max={100} noun="promos" nounKey="ps.noun" />
      {promos.data && promos.error ? <p className="text-danger" role="alert">{promos.error}</p> : null}
      {!promos.data ? <LoadState error={promos.error} /> : null}
      {promos.data && !promos.data.available ? (
        <EmptyState title={t("ps.soonTitle")}>{t("ps.soonBody")}</EmptyState>
      ) : null}
      {promos.data?.available && promos.data.promos.length === 0 && !draft ? (
        <EmptyState title={t("ps.emptyTitle")}>{t("ps.emptyBody")}</EmptyState>
      ) : null}
      {promos.data?.promos.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("ps.listAria")}>
          {promos.data.promos.map((p) => {
            const menuName = menuList.find((m) => m.id === p.menuId)?.name;
            return (
              <li key={p.id} className="card overflow-hidden">
                <div className="aspect-video bg-ink">
                  {p.imageUrl ? <img src={p.imageUrl} alt={t("ps.altFor", { name: p.name })} className="w-full h-full object-cover" /> : null}
                </div>
                <div className="p-4 grid gap-2">
                  <div>
                    <p className="font-semibold break-words">{p.name}</p>
                    <p className="text-sm text-muted">{t("ps.meta", { template: t(`ptpl.${p.template}.name`), dates: dateText(p, t), ago: timeAgo(p.updatedAt, t) })}</p>
                    <p className="text-sm" data-testid="promo-status">
                      {p.expired ? `${t("ps.ended")} ` : ""}
                      {p.placement === "added" ? t("ps.on", { menu: menuName ?? t("ps.aMenu") }) : p.placement === "scheduled" ? t("ps.schedWithShort", { menu: menuName ?? t("ps.aMenu") }) : t("ps.notOnMenu")}
                    </p>
                    {p.placement !== "none" ? (
                      <p className="text-sm text-muted" data-testid="promo-screens">
                        {(p.screens ?? []).length
                          ? `${p.placement === "scheduled" ? t("ps.playsOn", { dates: dateText(p, t) }) : t("ps.playingOn")}: ${(p.screens ?? []).map((d) => d.name).join(", ")}`
                          : t("ps.noScreen", { menu: menuName ?? t("ps.thisMenu") })}
                      </p>
                    ) : null}
                  </div>
                  {p.placement === "none" ? (
                    menuList.length ? (
                      <div className="flex flex-wrap gap-2 items-center">
                        {menuList.length > 1 ? (
                          <select className="field" aria-label={t("ps.menuFor", { name: p.name })} value={target[p.id] ?? menuList[0].id} onChange={(e) => setTarget({ ...target, [p.id]: e.target.value })}>
                            {menuList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        ) : null}
                        <button className="btn btn-primary" disabled={busy === p.id} onClick={() => addToMenu(p)}>
                          {busy === p.id ? t("ps.adding") : t("ps.addTo", { menu: menuList.length > 1 ? t("ps.menuWord") : menuList[0].name })}
                        </button>
                      </div>
                    ) : <p className="text-sm text-muted"><Link className="underline" href="/dashboard/media/menus">{t("ps.makeBoard")}</Link> {t("ps.toAdd")}</p>
                  ) : (
                    <button className="btn btn-quiet justify-self-start" disabled={busy === p.id} onClick={() => takeOff(p)}>{t("ps.takeOff")}</button>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-quiet" onClick={() => p.content && setDraft({ id: p.id, name: p.name, template: p.template, content: p.content, startsOn: p.startsOn ?? "", endsOn: p.endsOn ?? "" })}>{t("ed.edit")}</button>
                    <button className="btn btn-quiet text-danger" onClick={() => remove(p)}>{t("ed.delete")}</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {confirm.node}
    </section>
  );
}

function PromoEditor({ draft, setDraft, images, onSaved, onError, previewSrc, readOnly }: {
  draft: Draft; setDraft: (d: Draft | null) => void; images: MediaItem[];
  onSaved: (message: string) => void; onError: (message: string) => void;
  previewSrc?: string; readOnly?: boolean;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(previewSrc ?? null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  const c = draft.content;
  const update = (content: PromoContent) => setDraft({ ...draft, content });

  useEffect(() => {
    if (readOnly) {
      if (previewSrc) setPreview(previewSrc);
      return;
    }
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
          setPreviewError(body.error || t("ed.previewUnavailable"));
          return;
        }
        const url = URL.createObjectURL(await res.blob());
        if (last.current) URL.revokeObjectURL(last.current);
        last.current = url;
        setPreview(url);
        setPreviewError(null);
      } catch {
        setPreviewError(t("ed.previewUnavailable"));
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft.template, draft.content, readOnly, previewSrc, t]);

  async function save() {
    if (readOnly) return;
    setBusy(true);
    try {
      const body = JSON.stringify({ name: draft.name, template: draft.template, content: draft.content, startsOn: draft.startsOn || null, endsOn: draft.endsOn || null });
      if (draft.id) await api(`/api/promos/${draft.id}`, { method: "PATCH", body });
      else await api("/api/promos", { method: "POST", body });
      onSaved(draft.id ? t("ps.updated") : t("ps.created", { name: draft.name }));
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
      <h2 className="text-lg font-semibold">{draft.id ? t("ps.edit") : t("ps.new")}</h2>
      <fieldset className="mt-4">
        <legend className="form-label">{t("ps.template")}</legend>
        <div className="grid gap-3 sm:grid-cols-3 mt-1">
          {PROMO_TEMPLATES.map((tpl) => (
            <label key={tpl.id} className={`rounded-xl border p-3 cursor-pointer ${draft.template === tpl.id ? "border-primary ring-2 ring-primary/30" : "border-line"}`}>
              <input type="radio" name="promo-template" className="sr-only" checked={draft.template === tpl.id}
                onChange={() => setDraft({ ...draft, template: tpl.id, ...(draft.id ? {} : { content: { ...samplePromo(tpl.id), photoMediaId: c.photoMediaId, useBrand: c.useBrand }, name: t(`ptpl.${tpl.id}.name`) }) })} />
              <span className="flex gap-1 mb-2" aria-hidden>
                <span className="h-6 flex-1 rounded" style={{ background: tpl.swatch[0], border: "1px solid #d5e2f2" }} />
                <span className="h-6 w-8 rounded" style={{ background: tpl.swatch[1] }} />
              </span>
              <span className="font-medium block">{t(`ptpl.${tpl.id}.name`)}</span>
              <span className="text-xs text-muted">{t(`ptpl.${tpl.id}.blurb`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-6 lg:grid-cols-2 mt-5">
        <div className="grid gap-3 content-start">
          <label className="grid gap-1"><span className="form-label">{t("ps.nameLabel")}</span>
            <input className="field" value={draft.name} maxLength={PROMO_LIMITS.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          {field("tag", t("ps.f.label"), t("ps.f.labelPh"))}
          {field("headline", t("ps.f.headline"))}
          {field("subheadline", t("ps.f.sub"))}
          {field("price", t("ps.f.price"), t("ps.f.pricePh"))}
          {field("details", t("ps.f.details"))}
          {field("footer", t("ps.f.footer"), t("ps.f.footerPh"))}
          <label className="grid gap-1"><span className="form-label">{t("ps.photo")}</span>
            <select className="field" value={c.photoMediaId ?? ""} onChange={(e) => update({ ...c, photoMediaId: e.target.value || null })}>
              <option value="">{t("ps.noPhoto")}</option>
              {images.map((m) => <option key={m.id} value={m.id}>{m.fileName}</option>)}
            </select></label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.useBrand !== false} onChange={(e) => update({ ...c, useBrand: e.target.checked })} />
            {t("ps.useBrand")}
          </label>
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="form-label">{t("ps.dates")}</legend>
            <label className="grid gap-1 text-sm">{t("ps.starts")}
              <input type="date" className="field" value={draft.startsOn} onChange={(e) => setDraft({ ...draft, startsOn: e.target.value })} /></label>
            <label className="grid gap-1 text-sm">{t("ps.ends")}
              <input type="date" className="field" value={draft.endsOn} onChange={(e) => setDraft({ ...draft, endsOn: e.target.value })} /></label>
            <p className="col-span-2 text-xs text-muted">{t("ps.datesNote")}</p>
          </fieldset>
        </div>
        <div className="grid gap-3 content-start">
          <p className="form-label">{t("ps.preview")}</p>
          <div className="tv">
            {preview ? <img src={preview} alt={t("ps.previewAlt")} data-testid="promo-preview" className="w-full h-full object-contain" /> : null}
          </div>
          {previewError ? <p className="text-sm text-danger" role="alert">{previewError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? t("ed.saving") : draft.id ? t("ed.saveChanges") : t("ps.create")}</button>
            <button className="btn btn-quiet" disabled={busy} onClick={() => setDraft(null)}>{t("ed.cancel")}</button>
          </div>
          {placeholderFields(c).length ? (
            <p className="note-warn text-sm" role="status" data-testid="promo-placeholders">{t("ps.placeholders", { fields: placeholderFields(c, t).join(", ") })}</p>
          ) : null}
          {!draft.id ? <p className="text-xs text-muted" data-testid="promo-playlist-note">{t("ps.playlistNote")}</p> : null}
        </div>
      </div>
    </div>
  );
}
