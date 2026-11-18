"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, timeAgo, useApi, type DisplayItem, type MediaItem } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ShowOnScreens } from "@/components/show-on-screens";
import { SHOW_ON_SCREENS_STYLES, afterClassicSave, screenList } from "@/lib/show-on-screens";
import { useLocale } from "@/lib/i18n/client";
import { useConfirm } from "@/components/confirm";
import { EmptyState, LoadState, PageHeader, LimitNote, atLimit } from "@/components/ui";
import { IconImage } from "@/components/icons";
import { sampleMenu } from "@/lib/menu-templates";
import { artImages, seedClassicMenu, type Brand } from "@/lib/brand-kit";
import { BrandSummary, type BrandKitFixture } from "@/components/brand-kit";
import { LayoutStudio } from "@/components/layout-studio";
import { ClassicEditor, type ClassicDraft } from "@/components/classic-editor";
import { LayoutGallery } from "@/components/layout-gallery";
import { TemplateEditor, TemplateGallery, useMenuTemplatesFlag } from "@/components/menu-templates";
import { designById, designDocument } from "@/lib/menu-designs";
import type { AccountStudio } from "@/lib/layout-account";
import { parseLayout, type LayoutDocument, type LayoutTemplate } from "@/lib/layout-studio";
import {
  LAYOUT_OPTIONS,
  classifyBoardContent,
  layoutOptionById,
  parseUnifiedSearch,
  type LayoutOption,
} from "@/lib/menu-board-unify";
import { makeT, type T } from "@/lib/i18n";
import { boardKindLabel } from "@/lib/menu-board-label";

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

type View =
  | { mode: "list" }
  | { mode: "pick-layout"; screenId: string | null }
  | { mode: "classic"; draft: ClassicDraft; screenId: string | null }
  | { mode: "layout"; boardId: string | null; template: LayoutTemplate; screenId: string | null; zone?: string }
  // Premium templates (MENU_TEMPLATES flag): gallery, then the guided editor.
  | { mode: "template-gallery"; screenId: string | null }
  | { mode: "template"; menuId: string | null; name: string; document: LayoutDocument };

export type MenuFixture = {
  menus: MenuBoard[];
  available?: boolean;
  images?: MediaItem[];
  displays?: DisplayItem[];
  brand?: BrandKitFixture;
  startEditing?: boolean;
  startMenuId?: string;
  startView?: "list" | "pick-layout";
  startLayout?: LayoutTemplate;
  startZone?: string;
  startBoardId?: string | null;
  previewSrc?: string;
  studio?: AccountStudio;
  /** Preview harness: show the premium template experience without the server flag. */
  templates?: boolean;
  startTemplate?: string;
};

const EN: T = makeT("en");

function newClassicDraft(displayIds: string[] = [], brand?: Brand | null, t: T = EN): ClassicDraft {
  const content = brand ? seedClassicMenu(sampleMenu(), brand) : sampleMenu();
  return { id: null, name: t("mb.defaultName"), template: "classic", content, displayIds };
}

function openClassified(menu: MenuBoard, screenId: string | null): View | null {
  const classified = classifyBoardContent(menu.template, menu.content);
  if (classified.kind === "layout") {
    return { mode: "layout", boardId: menu.id, template: classified.document.template, screenId };
  }
  if (classified.kind === "classic") {
    return { mode: "classic", draft: { id: menu.id, name: menu.name, template: classified.template, content: classified.content, displayIds: [], imageUrl: menu.imageUrl }, screenId };
  }
  return null;
}

function initialView(fixture?: MenuFixture, search?: Record<string, string | string[] | undefined | null>, t: T = EN): { view: View; pendingBoardId: string | null } {
  if (fixture?.startMenuId) {
    const menu = fixture.menus.find((item) => item.id === fixture.startMenuId);
    if (menu) {
      const next = openClassified(menu, null);
      if (next) return { view: next, pendingBoardId: null };
    }
  }
  if (fixture?.startEditing) return { view: { mode: "classic", draft: newClassicDraft([], null, t), screenId: null }, pendingBoardId: null };
  if (fixture?.startLayout) {
    return {
      view: { mode: "layout", boardId: fixture.startBoardId ?? null, template: fixture.startLayout, screenId: null, zone: fixture.startZone },
      pendingBoardId: null,
    };
  }
  if (fixture?.startView === "pick-layout") return { view: { mode: "pick-layout", screenId: null }, pendingBoardId: null };
  if (fixture?.startTemplate === "gallery") return { view: { mode: "template-gallery", screenId: null }, pendingBoardId: null };
  if (fixture?.startTemplate) {
    const design = designById(fixture.startTemplate);
    if (design) return { view: { mode: "template", menuId: null, name: design.name.en, document: designDocument(design) }, pendingBoardId: null };
  }
  const parsed = parseUnifiedSearch(search ?? {});
  const screenId = parsed.screenId;
  if (parsed.boardId) {
    return { view: { mode: "list" }, pendingBoardId: parsed.boardId };
  }
  if (parsed.layout) {
    const option = layoutOptionById(parsed.layout);
    if (option?.kind === "classic") return { view: { mode: "classic", draft: newClassicDraft(screenId ? [screenId] : [], null, t), screenId }, pendingBoardId: null };
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
  const liveBrand = useApi<Brand>(fixture ? null : "/api/brand");
  const kit = fixture?.brand?.brand ?? liveBrand.data ?? null;
  const menus = fixture ? { data: { menus: fixture.menus, available: fixture.available !== false }, error: null, reload: async () => {} } : liveMenus;
  const displays = fixture ? { data: fixture.displays ?? [] } : liveDisplays;
  const media = fixture ? { data: fixture.images ?? [] } : liveMedia;
  const { locale, t } = useLocale();
  const started = initialView(fixture, initialSearch, t);
  const [view, setView] = useState<View>(started.view);
  const [pendingBoardId, setPendingBoardId] = useState<string | null>(started.pendingBoardId);
  const [selectedLayout, setSelectedLayout] = useState<LayoutOption | null>(null);
  const toast = useToast();
  // E2b: "Show on which screen?" after saving a classic board that isn't on any screen yet.
  const [pickClassic, setPickClassic] = useState<{ id: string; name: string; playlistId: string } | null>(null);
  const confirm = useConfirm();
  const templatesOn = useMenuTemplatesFlag(Boolean(fixture)) || Boolean(fixture?.templates);
  const draftOpen = view.mode === "classic" || view.mode === "layout" || view.mode === "pick-layout" || view.mode === "template-gallery" || view.mode === "template";

  /** A template board opens in the guided editor when templates are on; otherwise the existing editor. */
  function templateView(menu: MenuBoard): View | null {
    if (!templatesOn) return null;
    const parsed = parseLayout(menu.content);
    if (!parsed.ok || !parsed.value.design) return null;
    return { mode: "template", menuId: menu.id, name: menu.name, document: parsed.value };
  }

  useEffect(() => {
    if (!pendingBoardId || !menus.data?.menus) return;
    const menu = menus.data.menus.find((item) => item.id === pendingBoardId);
    if (!menu) return;
    if (templatesOn === null && !fixture) return; // wait for the flag so a template board opens in the right editor
    const next = templateView(menu) ?? openClassified(menu, parseUnifiedSearch(initialSearch ?? {}).screenId);
    if (next) setView(next);
    setPendingBoardId(null);
  }, [menus.data, pendingBoardId, initialSearch, templatesOn]); // eslint-disable-line react-hooks/exhaustive-deps

  function startNew() {
    if (studioEnabled && templatesOn) { setView({ mode: "template-gallery", screenId: parseUnifiedSearch(initialSearch ?? {}).screenId }); return; }
    if (studioEnabled) { setSelectedLayout(null); setView({ mode: "pick-layout", screenId: parseUnifiedSearch(initialSearch ?? {}).screenId }); }
    else setView({ mode: "classic", draft: newClassicDraft([], kit, t), screenId: null });
  }

  function pickOption(option: LayoutOption, screenId: string | null) {
    if (option.kind === "classic") {
      setView({ mode: "classic", draft: newClassicDraft(screenId ? [screenId] : [], kit, t), screenId });
      return;
    }
    if (option.layoutTemplate) {
      setView({ mode: "layout", boardId: null, template: option.layoutTemplate, screenId });
    }
  }

  function editMenu(menu: MenuBoard) {
    const next = templateView(menu) ?? openClassified(menu, parseUnifiedSearch(initialSearch ?? {}).screenId);
    if (next) setView(next);
    else toast.show(t("mb.cantOpen"), true);
  }

  async function remove(menu: MenuBoard) {
    const ok = await confirm.ask({
      title: t("mb.delTitle"),
      body: t("mb.delBody", { name: menu.name }),
      confirmLabel: t("ed.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/menus/${menu.id}`, { method: "DELETE" });
      await menus.reload();
      toast.show(t("mb.deleted"));
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
            title={t("mb.title")}
            eyebrow={t("mb.eyebrow")}
            icon={<IconImage />}
            lede={t("mb.lede")}
            action={<button type="button" className="btn btn-primary" onClick={startNew} disabled={atLimit(menus.data?.menus.length, 100)}>{t("mb.new")}</button>}
          />
          <p className="text-sm text-muted mb-4">
            <Link href="/dashboard/schedule#day-parts" className="font-semibold text-primary underline underline-offset-4">{t("mb.dayParts")}</Link>
            {" · "}
            <Link href="/dashboard/account/brand-kit" className="font-semibold text-primary underline underline-offset-4">{t("mb.brandKit")}</Link>
          </p>
        </>
      )}

      {!draftOpen && menus.data?.available ? <BrandSummary fixture={fixture?.brand} /> : null}

      {view.mode === "template-gallery" ? (
        <TemplateGallery
          onCancel={() => setView({ mode: "list" })}
          onAdvanced={() => { setSelectedLayout(null); setView({ mode: "pick-layout", screenId: view.screenId }); }}
          onPick={(document, name) => {
            // The owner's business name from the Brand Kit replaces the sample name; nothing else is changed.
            const title = kit?.displayName ? kit.displayName.slice(0, 40) : document.title;
            setView({ mode: "template", menuId: null, name: kit?.displayName || name, document: { ...document, title } });
          }}
        />
      ) : null}

      {view.mode === "template" ? (
        <TemplateEditor
          key={view.menuId ?? `new-${view.document.design}`}
          menuId={view.menuId}
          name={view.name}
          document={view.document}
          displays={displays.data ? displays.data.filter((d) => d.connected) : null}
          brand={kit}
          preview={Boolean(fixture)}
          onClose={() => { setView({ mode: "list" }); void menus.reload(); }}
          onSaved={() => { void menus.reload(); }}
          onAdvanced={(menuId) => setView({ mode: "layout", boardId: menuId, template: view.document.template, screenId: null })}
          onSplit={(document, name) => { toast.show(t("tpl.splitDone")); setView({ mode: "template", menuId: null, name, document }); }}
        />
      ) : null}

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
        <ClassicEditor
          images={artImages(media.data)}
          draft={view.draft}
          setDraft={(draft) => { if (!draft) setView({ mode: "list" }); else setView({ ...view, draft }); }}
          displays={(displays.data ?? []).filter((d) => d.connected)}
          onSaved={async (message, saved) => {
            setPickClassic(null); // Gother #100 low: never bring back a previous board's picker.
            const fromScreen = Boolean(view.screenId);
            const created = !view.draft.id;
            setView({ mode: "list" });
            await menus.reload();
            if (!saved || fixture) { toast.show(message); return; }
            const fresh = await api<DisplayItem[]>("/api/displays").catch(() => displays.data ?? []);
            const next = afterClassicSave({ created, fromScreen, tickedScreens: saved.tickedScreens, playlistId: saved.playlistId, displays: fresh });
            if (next.kind === "updated") {
              // E2b-F1: an existing board never brings back the picker; say where it updates instead.
              toast.show(next.screens.length ? t("menuBoards.updatedOn", { screens: screenList(next.screens, locale) }) : t("menuBoards.updatedNoScreen"));
              return;
            }
            toast.show(message);
            if (next.kind === "picker" && saved.playlistId) {
              setPickClassic({ id: saved.id, name: saved.name || t("ls.thisBoard"), playlistId: saved.playlistId });
              void liveDisplays.reload();
            }
          }}
          onError={(message) => toast.show(message, true)}
          previewSrc={fixture?.previewSrc}
          onImageUploaded={fixture ? undefined : () => liveMedia.reload()}
          readOnly={Boolean(fixture)}
          brand={kit}
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
          displays={displays.data ?? null}
          initialBoardId={view.boardId}
          initialTemplate={view.boardId ? null : view.template}
          initialZone={view.zone}
          embedded
          brand={fixture?.brand}
          onClose={() => setView({ mode: "list" })}
        />
      ) : null}

      {pickClassic && view.mode === "list" ? (
        <>
          <style>{SHOW_ON_SCREENS_STYLES}</style>
          <ShowOnScreens
            boardId={pickClassic.id}
            boardName={pickClassic.name}
            playlistId={pickClassic.playlistId}
            displays={displays.data ?? []}
            loading={!displays.data}
            assignAll={async (displayIds) => {
              await api(`/api/playlists/${pickClassic.playlistId}/publish`, { method: "POST", body: JSON.stringify({ displayIds }) });
            }}
            onSkip={() => setPickClassic(null)}
            onDone={(message) => { setPickClassic(null); toast.show(message); void liveDisplays.reload(); }}
          />
        </>
      ) : null}

      <LimitNote count={menus.data?.menus.length} max={100} noun="menu boards" nounKey="mb.noun" />
      {menus.data && menus.error ? <p className="text-danger" role="alert">{menus.error}</p> : null}
      {!menus.data ? <LoadState error={menus.error} /> : null}
      {menus.data && !menus.data.available ? (
        <EmptyState title={t("mb.soonTitle")}>{t("mb.soonBody")}</EmptyState>
      ) : null}
      {menus.data?.available && menus.data.menus.length === 0 && !draftOpen ? (
        <EmptyState title={t("mb.emptyTitle")}>{t("mb.emptyBody")}</EmptyState>
      ) : null}
      {menus.data?.menus.length && view.mode === "list" ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("mb.title")} data-testid="unify-list">
          {menus.data.menus.map((menu) => (
            <li key={menu.id} className="card overflow-hidden">
              <div className="relative aspect-video bg-ink">
                {menu.imageUrl ? <img src={menu.imageUrl} alt={t("mb.previewAlt", { name: menu.name })} referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-contain" /> : null}
              </div>
              <div className="p-4">
                <p className="font-semibold break-words">{menu.name}</p>
                <p className="text-sm text-muted">{boardKindLabel(menu.template, menu.content, t)} · {t("mb.updated", { ago: timeAgo(menu.updatedAt, t) })}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn btn-quiet" onClick={() => editMenu(menu)}>{t("ed.edit")}</button>
                  <button className="btn btn-quiet text-danger" onClick={() => remove(menu)}>{t("ed.delete")}</button>
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
