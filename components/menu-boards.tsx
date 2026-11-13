"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, timeAgo, useApi, type DisplayItem, type MediaItem } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { EmptyState, LoadState, PageHeader, LimitNote, atLimit } from "@/components/ui";
import { IconImage } from "@/components/icons";
import { MENU_TEMPLATES, sampleMenu } from "@/lib/menu-templates";
import { artImages, seedClassicMenu, type Brand } from "@/lib/brand-kit";
import { BrandSummary, type BrandKitFixture } from "@/components/brand-kit";
import { LayoutStudio } from "@/components/layout-studio";
import { ClassicEditor, type ClassicDraft } from "@/components/classic-editor";
import { LayoutGallery } from "@/components/layout-gallery";
import type { AccountStudio } from "@/lib/layout-account";
import { type LayoutTemplate } from "@/lib/layout-studio";
import {
  LAYOUT_OPTIONS,
  classifyBoardContent,
  layoutOptionById,
  layoutOptionForTemplate,
  parseUnifiedSearch,
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
  startMenuId?: string;
  startView?: "list" | "pick-layout";
  startLayout?: LayoutTemplate;
  startZone?: string;
  startBoardId?: string | null;
  previewSrc?: string;
  studio?: AccountStudio;
};

function newClassicDraft(displayIds: string[] = [], brand?: Brand | null): ClassicDraft {
  const content = brand ? seedClassicMenu(sampleMenu(), brand) : sampleMenu();
  return { id: null, name: "Lunch menu", template: "classic", content, displayIds };
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
    return { mode: "classic", draft: { id: menu.id, name: menu.name, template: classified.template, content: classified.content, displayIds: [], imageUrl: menu.imageUrl }, screenId };
  }
  return null;
}

function initialView(fixture?: MenuFixture, search?: Record<string, string | string[] | undefined | null>): { view: View; pendingBoardId: string | null } {
  if (fixture?.startMenuId) {
    const menu = fixture.menus.find((item) => item.id === fixture.startMenuId);
    if (menu) {
      const next = openClassified(menu, null);
      if (next) return { view: next, pendingBoardId: null };
    }
  }
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
  const liveBrand = useApi<Brand>(fixture ? null : "/api/brand");
  const kit = fixture?.brand?.brand ?? liveBrand.data ?? null;
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

  useEffect(() => {
    if (view.mode !== "classic" || view.draft.id) return;
    if (!kit) return;
    const sample = sampleMenu();
    if (view.draft.content.title !== sample.title || view.draft.content.footer !== sample.footer) return;
    const next = seedClassicMenu(view.draft.content, kit);
    if (next === view.draft.content) return;
    setView({ ...view, draft: { ...view.draft, content: next } });
  }, [kit, view]);

  function startNew() {
    if (studioEnabled) { setSelectedLayout(null); setView({ mode: "pick-layout", screenId: parseUnifiedSearch(initialSearch ?? {}).screenId }); }
    else setView({ mode: "classic", draft: newClassicDraft([], kit), screenId: null });
  }

  function pickOption(option: LayoutOption, screenId: string | null) {
    if (option.kind === "classic") {
      setView({ mode: "classic", draft: newClassicDraft(screenId ? [screenId] : [], kit), screenId });
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
        <ClassicEditor
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
