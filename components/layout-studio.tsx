"use client";
import { FileUploadControl } from "@/components/file-upload";
import { useLocale, useT } from "@/lib/i18n/client";
import { hasKey, type T } from "@/lib/i18n";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  accountSaveBody, applyLibraryFile, boardAfterReload, freshBoard, placeZoneMedia, readAccountStudio,
  type AccountBoard, type AccountLibraryFile, type AccountStudio,
} from "@/lib/layout-account";
import {
  containedBoard, frameFor, layoutSvg, mediaVideoBox, MENU_LIMITS, parseLayout, sampleLayout, seedBrand, templateSpec, zoneCapabilities,
  type LayoutDocument, type LayoutItem, type LayoutTemplate,
} from "@/lib/layout-studio";
import {
  editorStateAfterScopeChange, loadBrowserStudioState, originAfterScopeResolves, resolveStudioScope, sameStudioScope,
  saveAccountGuard, saveShouldWaitForScope, signedInPreviewLoad, writeStudioDraft, writeStudioPublished,
  type StudioScope,
} from "@/lib/layout-studio-draft";
import { editorPanelForZone, keepDraftOnZoneChange, previewHits, zoneEditorPlacement } from "@/lib/layout-studio-editor";
import { api, authToken, uploadForm, useApi, type DisplayItem } from "@/lib/api";
import { blobToBase64, prepareVideo, uploadToSignedUrl } from "@/lib/prepare-video";
import { findSameVideo } from "@/lib/layout-account";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { BrandSummary, type BrandKitFixture } from "@/components/brand-kit";
import { ColorField } from "@/components/color-field";
import { hasUnsavedEdits } from "@/lib/menu-board-unify";
import { publishSavedCopy } from "@/lib/screen-actions-ui";
import { ShowOnScreens } from "@/components/show-on-screens";
import { studioTemplateThumbnailSrc } from "@/lib/layout-thumbnails";
import { StudioStyles, useStudioBreakpoint } from "@/components/studio-chrome";
import { StudioGuardedLink, useConfirmDiscard, useRegisterStudioLeave } from "@/components/studio-leave";
import type { Brand } from "@/lib/brand-kit";
import { canAddItem, canAddSection, firstNamelessItem, sectionLimitMessage, menuCounts, moveItem, moveSection, needsName, normalizePrice, withoutNamelessItems } from "@/lib/menu-fields";
import { ItemNotes, MenuLimits, OrderButtons, ProductCard, useOpenItem } from "@/components/menu-item-fields";
import { BOARD_FONTS, isBoardFont } from "@/lib/board-fonts";

/** Isolated signed-out preview keeps the photo as a data URL in the browser. This is not the account-library 15 MB limit. */
export const ISOLATED_STUDIO_PHOTO_MAX_BYTES = 1_500_000;
export const ISOLATED_STUDIO_PHOTO_LIMIT_LABEL = "1.5 MB or smaller";

const TEMPLATES: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature", "two-menu-promo", "two-column"];

type StudioStep = "template" | "section" | "content" | "style" | "publish" | "preview";

type Snapshot = {
  doc: LayoutDocument;
  imageHref: string | null;
  videoOn: boolean;
  svg?: string;
  videoBox?: { x: number; y: number; w: number; h: number } | null;
};

function blankItem(): LayoutItem {
  return { name: "", price: "", description: "" };
}

export function LayoutStudio({
  mode = "preview",
  screenId = null,
  screenOnline,
  displays,
  screenConnected,
  fixture = null,
  pathOverride: _pathOverride,
  initialBoardId = null,
  initialTemplate = null,
  initialZone = null,
  embedded = false,
  brand = null,
  onClose,
}: {
  mode?: "preview" | "account";
  screenId?: string | null;
  screenOnline?: boolean;
  /** Account screens for the optional "Show on which screen?" step after Publish (E2). null = still loading; undefined = no step. */
  displays?: DisplayItem[] | null;
  screenConnected?: boolean;
  fixture?: AccountStudio | null;
  pathOverride?: string;
  initialBoardId?: string | null;
  initialTemplate?: LayoutTemplate | null;
  initialZone?: string | null;
  embedded?: boolean;
  brand?: BrandKitFixture | null;
  onClose?: () => void;
} = {}) {
  const t = useT();
  const { locale } = useLocale();
  const accountMode = mode === "account";
  const startingTemplate = initialTemplate ?? "menu-promo-67";
  const [template, setTemplate] = useState<LayoutTemplate>(startingTemplate);
  const [draft, setDraft] = useState<LayoutDocument>(() => sampleLayout(startingTemplate));
  const [imageHref, setImageHref] = useState<string | null>(null);
  const [videoOn, setVideoOn] = useState(true);
  const [_published, setPublished] = useState<Snapshot | null>(null);
  const [account, setAccount] = useState<AccountStudio | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [boardName, setBoardName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const studioBp = useStudioBreakpoint();
  const phonePreview = studioBp === "phone";
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [note, setNote] = useState(accountMode || fixture ? "" : t("ls.browserCopy"));
  const spec = templateSpec(template);
  const frame = frameFor(draft.template, draft.split, draft.columnWidths);
  const [step, setStep] = useState<StudioStep>("template");
  const [zone, setZone] = useState(initialZone || (startingTemplate === "triple-column" || startingTemplate === "two-menu-promo" || startingTemplate === "two-column" ? "column-0" : "menu"));
  const [sectionIndex, setSectionIndex] = useState(0);
  const [nameCheck, setNameCheck] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [pickFor, setPickFor] = useState<{ id: string; name: string; playlistId: string | null; preview: boolean } | null>(null);
  const saveLock = useRef<"draft" | "publish" | null>(null);
  const [scope, setScope] = useState<StudioScope | null>(null);
  const [origin, setOrigin] = useState<StudioScope | null>(null);
  const previousScope = useRef<StudioScope | null>(null);
  const fromCurrentAccount = useRef(false);
  const scopeRef = useRef<StudioScope | null>(null);
  const originRef = useRef<StudioScope | null>(null);
  scopeRef.current = scope;
  originRef.current = origin;
  type CleanEdit = {
    menuId: string | null;
    boardName: string;
    template: LayoutTemplate;
    draft: LayoutDocument;
    imageHref: string | null;
    clipUrl: string | null;
    videoOn: boolean;
  };
  const cleanRef = useRef<CleanEdit | null>(null);
  const confirmDiscard = useConfirmDiscard();
  function markClean(state: CleanEdit) { cleanRef.current = state; }
  function currentEdit(): CleanEdit {
    return { menuId, boardName, template, draft, imageHref, clipUrl, videoOn };
  }
  function studioIsDirty(): boolean {
    return cleanRef.current != null && hasUnsavedEdits(currentEdit(), cleanRef.current);
  }

  /** Leave the editor (back, or the Menu boards link). Prompts only when there are unsaved changes. */
  function requestLeave(after: () => void) {
    confirmDiscard(studioIsDirty(), after);
  }
  useRegisterStudioLeave(studioIsDirty);
  const liveBrand = useApi<Brand>(accountMode && !fixture && !brand ? "/api/brand" : null);
  // The board preview follows typing at low priority so long menus stay responsive (QA B1-05),
  // and rows without a name are left out, as they are when the board is saved (QA B1-02).
  const previewDraft = useDeferredValue(draft);
  const svg = useMemo(() => layoutSvg(withoutNamelessItems(previewDraft), { imageHref }), [previewDraft, imageHref]);
  const previewMarkup = phonePreview ? enlargePreviewText(svg) : svg;
  const videoBox = mediaVideoBox(draft);
  const librarySrc = libraryVideoUrl(account, draft.videoMediaId, !accountMode && videoOn && !draft.videoMediaId && !clipUrl);
  const zoneSrc = clipUrl || librarySrc || "/layout-studio/media/promo";
  const showZone = Boolean(videoBox) && (accountMode ? Boolean(clipUrl || (draft.videoMediaId && librarySrc)) : Boolean(clipUrl) || videoOn || Boolean(draft.videoMediaId));

  useEffect(() => {
    if (menuId) return;
    if (studioIsDirty()) return;
    const colors = brand?.brand ?? liveBrand.data;
    const next = seedBrand(draft, colors);
    if (next === draft) return;
    setDraft(next);
    const baseline = cleanRef.current ?? currentEdit();
    markClean({ ...baseline, menuId: null, draft: next });
    // Seed only when the kit arrives on a still-new, untouched board — not on every draft keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveBrand.data, brand, menuId]);

  useEffect(() => {
    if (fixture) {
      const previewScope = { userId: "preview-user", orgId: "preview-org" };
      fromCurrentAccount.current = true;
      setScope(previewScope);
      setOrigin(previewScope);
      return;
    }
    if (!supabaseConfigured()) return;
    let cancel = false;
    getSupabase().auth.getSession().then(async ({ data }) => {
      const next = await resolveStudioScope(data.session);
      if (!cancel) setScope(next);
    }).catch(() => { /* unsigned isolated preview stores nothing unscoped */ });
    return () => { cancel = true; };
  }, [fixture]);

  useEffect(() => {
    if (scope && fromCurrentAccount.current && !origin) setOrigin(scope);
  }, [scope, origin]);

  useEffect(() => {
    const prev = previousScope.current;
    previousScope.current = scope;
    if (!prev || sameStudioScope(prev, scope)) return;
    if (accountMode) {
      if (origin && scope && !sameStudioScope(origin, scope)) {
        const created = freshBoard(account?.boards.length ?? 0);
        applyFresh(created, scope);
        setNote(t("ls.switched"));
      }
      return;
    }
    try {
      const next = editorStateAfterScopeChange(window.localStorage, scope);
      if (next.draft) {
        setTemplate(next.draft.doc.template);
        setDraft(next.draft.doc);
        setImageHref(next.draft.imageHref);
        setVideoOn(next.draft.videoOn);
        setOrigin(scope);
      } else {
        applyFresh(freshBoard(0), scope);
      }
      setPublished(next.published);
    } catch { /* private mode */ }
    // Only react to a real scope change; origin and board count are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a scope change is the trigger
  }, [scope, accountMode]);

  useEffect(() => {
    if (accountMode || fixture) return;
    if (!scope) return;
    try {
      const loaded = loadBrowserStudioState({ accountMode: false, scope, storage: window.localStorage });
      if (loaded.draft) {
        setTemplate(loaded.draft.doc.template);
        setDraft(loaded.draft.doc);
        setImageHref(loaded.draft.imageHref);
        setVideoOn(loaded.draft.videoOn === true && frameFor(loaded.draft.doc.template, loaded.draft.doc.split).video !== null);
        setOrigin(scope);
        setNote(t("ls.restored"));
      }
      if (loaded.published) setPublished(loaded.published);
    } catch { /* a bad draft is ignored */ }
  }, [accountMode, fixture, scope, t]);


  useEffect(() => {
    if (fixture) {
      const preferred = initialBoardId ? fixture.boards.find((item) => item.id === initialBoardId) : null;
      const board = preferred ?? ((initialTemplate && !initialBoardId) ? null : (fixture.boards[0] ?? null));
      setAccount(fixture);
      if (board) {
        const nextImage = fixture.library.find((file) => file.id === board.document.imageMediaId)?.url ?? null;
        const nextVideoOn = Boolean(board.document.videoMediaId) && frameFor(board.document.template, board.document.split).video !== null;
        setMenuId(board.id);
        setBoardName(board.name);
        setTemplate(board.document.template);
        setDraft(board.document);
        setImageHref(nextImage);
        setVideoOn(nextVideoOn);
        markClean({
          menuId: board.id,
          boardName: board.name,
          template: board.document.template,
          draft: board.document,
          imageHref: nextImage,
          clipUrl: null,
          videoOn: nextVideoOn,
        });
      } else {
        const created = initialTemplate ? { name: freshBoard(fixture.boards.length).name, document: sampleLayout(initialTemplate) } : freshBoard(fixture.boards.length);
        const seeded = seedBrand(created.document, brand?.brand);
        setMenuId(null);
        setBoardName(created.name);
        setTemplate(seeded.template);
        setDraft(seeded);
        setImageHref(null);
        setVideoOn(false);
        markClean({
          menuId: null,
          boardName: created.name,
          template: seeded.template,
          draft: seeded,
          imageHref: null,
          clipUrl: null,
          videoOn: false,
        });
      }
      setNote("");
      return;
    }
    if (accountMode) {
      let cancel = false;
      api<unknown>("/api/layout-studio").then((body) => {
        if (cancel) return;
        const loaded = readAccountStudio(body);
        if (!loaded) { setNote(t("ls.cantRead")); return; }
        setAccount(loaded);
        const result = signedInPreviewLoad(loaded, null);
        // Read scope from a ref so a slow resolveStudioScope cannot leave origin null.
        const currentScope = scopeRef.current;
        const preferred = initialBoardId ? loaded.boards.find((item) => item.id === initialBoardId) : null;
        if (preferred) {
          adoptBoard(preferred, loaded, false, currentScope);
        } else if (initialTemplate && !initialBoardId) {
          applyFresh({ name: freshBoard(loaded.boards.length).name, document: sampleLayout(initialTemplate) }, currentScope);
        } else if (result.kind === "board" && result.board) {
          adoptBoard(result.board, loaded, false, currentScope);
        } else {
          applyFresh(result.fresh ?? freshBoard(0), currentScope);
        }
        setNote("");
      }).catch((err: Error) => { if (!cancel) setNote(err.message); });
      return () => { cancel = true; };
    }
    if (!supabaseConfigured()) return;
    let cancel = false;
    getSupabase().auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token || cancel) return;
      const nextScope = await resolveStudioScope(data.session);
      if (cancel) return;
      if (nextScope) setScope(nextScope);
      const res = await fetch("/api/layout-studio", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok || cancel) return;
      const loaded = readAccountStudio(await res.json().catch(() => null));
      if (!loaded || cancel) return;
      setSessionToken(token);
      setAccount(loaded);
      const result = signedInPreviewLoad(loaded, null);
      if (result.kind === "board" && result.board) {
        adoptBoard(result.board, loaded, true);
        if (nextScope) setOrigin(nextScope);
      } else {
        // No board on this account: never keep a previous org's draft on screen.
        applyFresh(result.fresh ?? freshBoard(0), nextScope);
      }
      setNote("");
    }).catch(() => { /* no session: the browser preview stays local */ });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per mode; adoptBoard is a render helper
  }, [accountMode, fixture]);

  function selectBoard(id: string) {
    if (!account) return;
    if (id === (menuId ?? "")) return;
    confirmDiscard(studioIsDirty(), () => openBoard(id));
  }

  function openBoard(id: string) {
    if (!account) return;
    if (!id) { newBoard(true); return; }
    const board = account.boards.find((item) => item.id === id);
    if (!board) return;
    const nextImage = account.library.find((file) => file.id === board.document.imageMediaId)?.url ?? null;
    const nextVideoOn = Boolean(board.document.videoMediaId) && frameFor(board.document.template, board.document.split).video !== null;
    setMenuId(board.id);
    setBoardName(board.name);
    setTemplate(board.document.template);
    setDraft(board.document);
    setImageHref(nextImage);
    setClipUrl(null);
    setVideoOn(nextVideoOn);
    setZone("");
    setStep("template");
    setNote("");
    fromCurrentAccount.current = true;
    const currentScope = scopeRef.current;
    if (currentScope) {
      originRef.current = currentScope;
      setOrigin(currentScope);
    }
    markClean({
      menuId: board.id,
      boardName: board.name,
      template: board.document.template,
      draft: board.document,
      imageHref: nextImage,
      clipUrl: null,
      videoOn: nextVideoOn,
    });
  }

  function newBoard(alreadyConfirmed = false) {
    if (alreadyConfirmed) { startFreshBoard(); return; }
    confirmDiscard(studioIsDirty(), startFreshBoard);
  }

  function startFreshBoard() {
    const created = freshBoard(account?.boards.length ?? 0, window.prompt("Name this board", freshBoard(account?.boards.length ?? 0).name));
    applyFresh(created, scopeRef.current);
    setNote("");
  }

  function applyFresh(created: { name: string; document: LayoutDocument }, nextScope: StudioScope | null) {
    const seeded = seedBrand(created.document, brand?.brand ?? liveBrand.data);
    setBoardName(created.name);
    setMenuId(null);
    setTemplate(seeded.template);
    setDraft(seeded);
    setImageHref(null);
    setClipUrl(null);
    setVideoOn(false);
    setZone("");
    setStep("template");
    fromCurrentAccount.current = true;
    originRef.current = nextScope;
    setOrigin(nextScope);
    markClean({
      menuId: null,
      boardName: created.name,
      template: seeded.template,
      draft: seeded,
      imageHref: null,
      clipUrl: null,
      videoOn: false,
    });
  }

  function adoptBoard(board: AccountBoard, studio: AccountStudio, allowVideo: boolean, nextScope: StudioScope | null = scopeRef.current) {
    const nextImage = studio.library.find((file) => file.id === board.document.imageMediaId)?.url ?? null;
    const nextVideoOn = allowVideo && Boolean(board.document.videoMediaId) && frameFor(board.document.template, board.document.split).video !== null;
    setMenuId(board.id);
    setBoardName(board.name);
    setTemplate(board.document.template);
    setDraft(board.document);
    setImageHref(nextImage);
    setClipUrl(null);
    setVideoOn(nextVideoOn);
    fromCurrentAccount.current = true;
    if (nextScope) {
      originRef.current = nextScope;
      setOrigin(nextScope);
    }
    markClean({
      menuId: board.id,
      boardName: board.name,
      template: board.document.template,
      draft: board.document,
      imageHref: nextImage,
      clipUrl: null,
      videoOn: nextVideoOn,
    });
  }

  function closeZone() {
    setZone("");
    setStep("template");
  }

  function choose(next: LayoutTemplate) {
    const sample = sampleLayout(next);
    const document = menuId ? sample : seedBrand(sample, brand?.brand ?? liveBrand.data);
    setTemplate(next);
    setDraft(document);
    setImageHref(null);
    setClipUrl(null);
    setZone(next === "triple-column" || next === "two-menu-promo" || next === "two-column" ? "column-0" : "menu");
    setSectionIndex(0);
    setVideoOn(accountMode ? false : frameFor(next, document.split).video !== null);
  }

  function update(next: LayoutDocument) {
    setDraft(next);
    if (saveLock.current) return;
    setNote(t("ls.editingDraft"));
  }

  function namelessBlocked(): boolean {
    const nameless = firstNamelessItem(draft.sections);
    if (!nameless) return false;
    setNameCheck(true);
    setNote(t("mf.nameRequired"));
    const columns = template === "triple-column" || template === "two-menu-promo" || template === "two-column";
    setSectionIndex(nameless.section);
    setZone(columns ? `column-${nameless.section}` : "menu");
    window.setTimeout(() => document.getElementById(`studio-item-${nameless.section}-${nameless.item}-name`)?.focus(), 50);
    return true;
  }

  function checkedDraft(): LayoutDocument | null {
    if (namelessBlocked()) return null;
    const parsed = parseLayout(draft);
    if (!parsed.ok) { setNote(parsed.error); return null; }
    return parsed.value;
  }

  function saveDraft() {
    const doc = checkedDraft();
    if (!doc) return;
    if (!scope) {
      setNote(t("ls.signInDraft"));
      return;
    }
    const snapshot: Snapshot = { doc, imageHref, videoOn: videoOn && !!videoBox };
    writeStudioDraft(window.localStorage, scope, { ...snapshot, boardId: menuId });
    setDraft(doc);
    setOrigin(scope);
    setNote(t("ls.draftKept"));
    markClean({ ...currentEdit(), draft: doc });
  }

  function publish() {
    const doc = checkedDraft();
    if (!doc) return;
    if (!scope) {
      setNote(t("ls.signInPublish"));
      return;
    }
    const box = mediaVideoBox(doc);
    const snapshot: Snapshot = {
      doc, imageHref, videoOn: videoOn && !!box,
      svg: layoutSvg(doc, { imageHref }),
      videoBox: box,
    };
    writeStudioPublished(window.localStorage, scope, { ...snapshot, boardId: menuId });
    setDraft(doc);
    setPublished(snapshot);
    setOrigin(scope);
    setNote(t("ls.frozen"));
    markClean({ ...currentEdit(), draft: doc, videoOn: videoOn && !!box });
  }

  async function reloadAccount(preferId: string | null, keepUnsaved = false) {
    const loaded = readAccountStudio(await api<unknown>("/api/layout-studio"));
    if (!loaded) throw new Error(t("ls.cantReload"));
    setAccount(loaded);
    const board = boardAfterReload(loaded, preferId, { keepUnsaved });
    if (!board) return loaded;
    const nextImage = loaded.library.find((file) => file.id === board.document.imageMediaId)?.url ?? null;
    const nextVideoOn = Boolean(board.document.videoMediaId);
    setMenuId(board.id);
    setBoardName(board.name);
    setTemplate(board.document.template);
    setDraft(board.document);
    setImageHref(nextImage);
    setClipUrl(null);
    setVideoOn(nextVideoOn);
    const currentScope = scopeRef.current;
    if (currentScope) {
      originRef.current = currentScope;
      setOrigin(currentScope);
    }
    if (!keepUnsaved) {
      markClean({
        menuId: board.id,
        boardName: board.name,
        template: board.document.template,
        draft: board.document,
        imageHref: nextImage,
        clipUrl: null,
        videoOn: nextVideoOn,
      });
    }
    return loaded;
  }

  async function saveAccount(saveMode: "draft" | "publish") {
    if (namelessBlocked()) return;
    if (fixture) {
      setNote(saveMode === "publish" ? t("ls.previewNotPublished") : t("ls.previewNotSaved"));
      if (saveMode === "publish" && displays !== undefined && menuId && !screenId) {
        const board = fixture.boards.find((item) => item.id === menuId);
        setPickFor({ id: menuId, name: boardName || board?.name || t("ls.thisBoard"), playlistId: board?.playlistId ?? null, preview: true });
      }
      return;
    }
    let currentScope = scopeRef.current;
    let currentOrigin = originAfterScopeResolves(fromCurrentAccount.current, originRef.current, currentScope);
    // Scope is often still null at mount. Resolve it now so a slow first resolve cannot refuse a legitimate save.
    if (saveShouldWaitForScope(fromCurrentAccount.current, currentOrigin, currentScope) && supabaseConfigured()) {
      try {
        const { data } = await getSupabase().auth.getSession();
        currentScope = await resolveStudioScope(data.session);
        if (currentScope) {
          scopeRef.current = currentScope;
          setScope(currentScope);
        }
        currentOrigin = originAfterScopeResolves(fromCurrentAccount.current, originRef.current, currentScope);
      } catch { /* still unresolved */ }
    }
    if (currentOrigin) {
      originRef.current = currentOrigin;
      setOrigin(currentOrigin);
    }
    if (saveShouldWaitForScope(fromCurrentAccount.current, currentOrigin, currentScope)) {
      setNote(t("ls.confirming"));
      return;
    }
    const guard = saveAccountGuard(currentOrigin, currentScope);
    if (!guard.allow) {
      if (guard.resetToFresh) {
        applyFresh(freshBoard(account?.boards.length ?? 0), currentScope);
      }
      setNote(guard.message);
      return;
    }
    if (saveLock.current) return;
    const doc = checkedDraft();
    if (!doc) return;
    saveLock.current = saveMode;
    setSaving(saveMode);
    setNote(saveMode === "publish" ? t("ls.publishing") : t("ls.savingDraft"));
    try {
      const body = await api<{ menuId?: string; swapped?: boolean }>("/api/layout-studio", {
        method: "POST",
        body: JSON.stringify(accountSaveBody({ mode: saveMode, menuId, name: boardName.trim() || doc.title || "Menu", document: doc })),
      });
      const nextId = typeof body.menuId === "string" ? body.menuId : menuId;
      const loaded = await reloadAccount(nextId);
      const boardId = typeof body.menuId === "string" ? body.menuId : nextId;
      const board = loaded.boards.find((item) => item.id === boardId);
      if (saveMode !== "publish") {
        setNote(t("ls.draftSaved"));
      } else if (screenId) {
        if (!board?.playlistId) {
          setNote(t("ls.noPlaylist"));
        } else {
          await api("/api/layout-studio/assign", { method: "POST", body: JSON.stringify({ menuId: board.id, displayId: screenId }) });
          setNote(publishSavedCopy({
            online: screenOnline ?? false,
            connected: screenConnected ?? true,
          }, t));
        }
      } else if (board?.playlistId) {
        setNote(t("ls.published"));
        // E2: offer screens, but never assign without the user's choice.
        if (displays !== undefined) setPickFor({ id: board.id, name: board.name || boardName || t("ls.thisBoard"), playlistId: board.playlistId, preview: false });
      } else {
        setNote(t("ls.noPlaylistCreated"));
      }
    } catch (err) {
      setNote((err as Error).message || (saveMode === "publish" ? t("ls.cantPublish") : t("ls.cantSave")));
    } finally {
      setSaving(null);
      setTimeout(() => { saveLock.current = null; }, 0);
    }
  }

  function openZone(next: string) {
    setZone(keepDraftOnZoneChange(draft, zone, next) ? next : next);
    if (next.startsWith("column-")) {
      const index = Number(next.slice("column-".length));
      setSectionIndex(Number.isFinite(index) ? index : 0);
      setStep("section");
    } else if (next === "menu") {
      setStep("section");
    } else {
      setStep("content");
    }
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 860px)").matches) {
      requestAnimationFrame(() => {
        document.getElementById("studio-selected-editor")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } else if (typeof window !== "undefined") {
      // Photo/video controls open under the board; start them at the top for the new area.
      requestAnimationFrame(() => { document.getElementById("studio-canvas-tools")?.scrollTo({ top: 0 }); });
    }
  }

  function onPhoto(file: File | undefined) {
    if (!file) { removePhoto(); return; }
    const imageOk = !file.type || file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp" || /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!imageOk) { setNote(t("ls.badFormat")); return; }
    const exclusive = zone === "feature" && template !== "signature";
    const replacedVideo = exclusive && Boolean(draft.videoMediaId || clipUrl || videoOn);
    const local = URL.createObjectURL(file);
    setImageHref(local);
    if (exclusive) {
      if (clipUrl) URL.revokeObjectURL(clipUrl);
      setClipUrl(null);
      setVideoOn(false);
      setDraft((current) => placeZoneMedia(current, "photo", current.imageMediaId, true));
    }
    if (!accountMode && !sessionToken) {
      if (file.size > ISOLATED_STUDIO_PHOTO_MAX_BYTES) { setNote(t("ls.photoTooBig")); setImageHref(null); return; }
      const reader = new FileReader();
      reader.onload = () => setImageHref(typeof reader.result === "string" ? reader.result : local);
      reader.readAsDataURL(file);
      setNote(replacedVideo ? t("ls.imageReplacesVideo") : t("ls.photoPreviewOnly"));
      return;
    }
    setProgress(t("ed.uploading"));
    const form = new FormData();
    form.set("file", file);
    form.set("name", file.name);
    const send = sessionToken
      ? uploadForm("/api/media", form, sessionToken, (percent) => setProgress(percent >= 99 ? t("ls.processing") : t("ed.uploading")))
      : authToken().then((token) => uploadForm("/api/media", form, token, (percent) => setProgress(percent >= 99 ? t("ls.processing") : t("ed.uploading"))));
    send.then(async (body) => {
      const loaded = await reloadAccount(menuId, true);
      const entry = loaded.library.find((item) => item.id === body.id) ?? null;
      const exclusive = zone === "feature" && template !== "signature";
      setDraft((current) => {
        const applied = entry ? applyLibraryFile(current, entry, "photo") : { ...current, imageMediaId: body.id ?? null };
        return placeZoneMedia(applied, "photo", applied.imageMediaId, exclusive);
      });
      if (exclusive) { setClipUrl(null); setVideoOn(false); }
      setImageHref(entry?.url || local);
      setProgress(null);
      setNote(replacedVideo ? t("ls.imageReplacesVideo") : t("ls.uploadComplete"));
    }).catch((err: Error) => {
      setProgress(null);
      setNote(err.message || "Couldn't upload that photo.");
    });
  }

  function removePhoto() {
    setImageHref(null);
    update({ ...draft, imageMediaId: null });
    setNote(t("ls.photoRemoved"));
  }

  async function onVideo(file: File | undefined) {
    if (!file) return;
    if (!videoBox || zone === "photo" || zone === "background" || zone === "menu" || zone.startsWith("column-")) {
      setNote(t("ls.noVideoZone"));
      return;
    }
    const exclusive = zone === "feature" && template !== "signature";
    const replacedImage = exclusive && Boolean(draft.imageMediaId || imageHref);
    const local = URL.createObjectURL(file);
    setClipUrl(local);
    setVideoOn(true);
    if (exclusive) {
      setImageHref(null);
      setDraft((current) => placeZoneMedia(current, "video", current.videoMediaId, true));
    }
    if (!accountMode && !sessionToken) {
      setNote(replacedImage ? t("ls.videoReplacesSignIn") : t("ls.videoPreviewSignIn"));
      return;
    }
    const existing = accountMode ? findSameVideo(account?.library, file) : null;
    if (existing) {
      // Same file is already in the library: use it instead of uploading a second copy (QA B1-10).
      setDraft((current) => {
        const applied = applyLibraryFile(current, existing, "video");
        return placeZoneMedia(applied, "video", applied.videoMediaId, exclusive);
      });
      if (exclusive) setImageHref(null);
      if (existing.url) setClipUrl(null);
      setNote(t("ls.videoInLibrary"));
      return;
    }
    setProgress(t("ed.uploading"));
    try {
      const prepared = await prepareVideo(file);
      const signed = await api<{ mediaId: string; signedUrl: string; token: string }>("/api/media/upload", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, sizeBytes: file.size }),
      });
      await uploadToSignedUrl(signed.signedUrl, file, (percent) => {
        setProgress(percent >= 99 ? t("ls.processing") : t("ed.uploading"));
      }, file.name, signed.token);
      setProgress(t("ls.processing"));
      await api("/api/media/upload/complete", {
        method: "POST",
        body: JSON.stringify({
          mediaId: signed.mediaId,
          fileName: file.name,
          durationMs: prepared.durationMs,
          width: prepared.width,
          height: prepared.height,
          thumbnailBase64: await blobToBase64(prepared.thumbnail),
        }),
      });
      const loaded = await reloadAccount(menuId, true);
      const entry = loaded.library.find((item) => item.id === signed.mediaId) ?? null;
      setDraft((current) => {
        const applied = entry ? applyLibraryFile(current, entry, "video") : { ...current, videoMediaId: signed.mediaId };
        return placeZoneMedia(applied, "video", applied.videoMediaId, exclusive);
      });
      if (exclusive) setImageHref(null);
      if (entry?.url) setClipUrl(null);
      setProgress(null);
      setNote(replacedImage ? t("ls.videoReplaces") : t("ls.uploadComplete"));
    } catch (err) {
      setProgress(null);
      setNote((err as Error).message || "Couldn't upload that video.");
    }
  }

  function removeVideo() {
    if (clipUrl) URL.revokeObjectURL(clipUrl);
    setClipUrl(null);
    setVideoOn(false);
    update({ ...draft, videoMediaId: null });
    setNote(t("ls.videoRemoved"));
  }

  const activeSection = Math.min(sectionIndex, Math.max(0, draft.sections.length - 1));
  const photoLabel = zone === "photo" || zone === "background" || template === "signature" ? t("ls.bgImage") : t("ls.featurePhoto");

  function renderStage(interactive: boolean) {
    return (
      <Stage
        svg={previewMarkup}
        video={showZone ? videoBox : null}
        videoSrc={zoneSrc}
        label=""
        hits={interactive ? previewHits(template, frame) : []}
        active={zone}
        onHit={interactive ? openZone : () => undefined}
      />
    );
  }
  const editorPlacement = zoneEditorPlacement(zone, studioBp);
  const zoneEditor = (
    <SelectedZoneEditor
      key={editorPlacement === "canvas" ? `canvas-${zone}` : "left"}
      zone={zone}
      template={template}
      draft={draft}
      update={update}
      closeZone={closeZone}
      account={account}
      progress={progress}
      imageHref={imageHref}
      clipUrl={clipUrl}
      videoOn={videoOn}
      accountMode={accountMode}
      isolatedPhotoLimit={!accountMode && !sessionToken}
      sectionIndex={activeSection}
      setSectionIndex={(index) => { setSectionIndex(index); setZone(template === "triple-column" || template === "two-menu-promo" || template === "two-column" ? `column-${index}` : "menu"); }}
      photoLabel={photoLabel}
      onPhoto={onPhoto}
      onVideo={onVideo}
      removePhoto={removePhoto}
      removeVideo={removeVideo}
      setImageHref={setImageHref}
      setClipUrl={setClipUrl}
      setVideoOn={setVideoOn}
      setNote={setNote}
      nameCheck={nameCheck}
      setNameCheck={setNameCheck}
    />
  );
  function renderSaveDraft() {
    return accountMode || account
      ? <button type="button" className="btn btn-quiet min-h-11" disabled={saving !== null} onClick={() => { void saveAccount("draft"); }}>{saving === "draft" ? t("ed.saving") : t("ls.saveDraft")}</button>
      : <button type="button" className="btn btn-quiet min-h-11" onClick={saveDraft}>{t("ls.saveDraft")}</button>;
  }
  function renderPublish() {
    return accountMode || account
      ? <button type="button" className="btn btn-primary min-h-11" disabled={saving !== null} onClick={() => { void saveAccount("publish"); }}>{saving === "publish" ? t("ls.publishing") : t("ls.publish")}</button>
      : <button type="button" className="btn btn-primary min-h-11" onClick={publish}>{t("ls.publishPreview")}</button>;
  }
  function renderPreviewButton() {
    return accountMode
      ? (
        <button type="button" className="btn btn-quiet min-h-11" onClick={() => {
          setStep("preview");
          document.getElementById("studio-tv-preview")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }}>{t("ls.preview")}</button>
      )
      : <a href="/layout-studio/player" className="btn btn-quiet min-h-11" style={{ textDecoration: "none" }}>{t("ls.preview")}</a>;
  }

  return (
    <main className={zone && step !== "template" ? "studio-app zone-open" : "studio-app"} style={{ minHeight: embedded ? undefined : "100vh", background: embedded ? "transparent" : "#f4f7fb", color: "#0b1220", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }} data-embedded={embedded ? "true" : undefined} data-step={step}>
      <header className="studio-toolbar">
        <div className="studio-toolbar-lead">
          {onClose ? <button type="button" className="studio-back" disabled={saving !== null} onClick={() => requestLeave(onClose)}>{t("ls.back")}</button> : null}
          <div className="studio-page-title">
            {renaming && account ? (
              <input aria-label={t("ls.boardName")} className="studio-title-input" value={boardName} maxLength={80} autoFocus
                onChange={(event) => setBoardName(event.target.value)}
                onBlur={() => setRenaming(false)}
                onKeyDown={(event) => { if (event.key === "Enter") setRenaming(false); }} />
            ) : (
              <h1 className="studio-title">
                <span className="studio-title-text">{account ? (boardName || (menuId ? t("ls.untitled") : t("ls.newMenuBoard"))) : (embedded ? (menuId ? t("ls.editMenuBoard") : t("ls.newMenuBoard")) : "Layout Studio")}</span>
                {account ? <button type="button" className="studio-rename" aria-label={t("ls.rename")} onClick={() => setRenaming(true)} title={t("ls.rename")}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg></button> : null}
              </h1>
            )}
          </div>
          {account ? (
            <div className="board-bar">
              <select aria-label={t("ls.switch")} className="board-switch" value={menuId ?? ""} onChange={(event) => selectBoard(event.target.value)}>
                {menuId ? null : <option value="">{boardName || t("ls.untitled")}</option>}
                {account.boards.map((board) => <option key={board.id} value={board.id}>{board.id === menuId ? boardChoice({ ...board, name: boardName || board.name }, locale) : boardChoice(board, locale)}</option>)}
              </select>
              <button type="button" className="btn btn-quiet board-new" onClick={() => newBoard()}>{t("ls.newBoard")}</button>
            </div>
          ) : null}
        </div>
        <div className="studio-toolbar-actions">
          {renderSaveDraft()}
          {renderPreviewButton()}
          {renderPublish()}
        </div>
        {progress || note ? <p className="studio-toolbar-note" role="status">{progress || note}</p> : null}
      </header>
      {pickFor && displays !== undefined ? (
        <ShowOnScreens boardId={pickFor.id} boardName={pickFor.name} playlistId={pickFor.playlistId} displays={displays ?? []} loading={displays === null} preview={pickFor.preview}
          onSkip={() => setPickFor(null)} onDone={(message) => { setPickFor(null); setNote(message); }} />
      ) : null}
      <div className="studio-grid">
        <div className="studio-left">
        <section className="studio-controls" data-testid="studio-tools">
          {screenId ? <p style={{ fontSize: 14 }}>{t("ls.oneScreen")}</p> : null}

          <div className={step === "template" ? "studio-pane on" : "studio-pane"} data-step="template">
            <details className="studio-panel" open>
              <summary className="studio-panel-summary">{t("ls.layout")}</summary>
              <TemplatePicker template={template} onChoose={choose} />
            </details>
            <details className="studio-panel" open>
              <summary className="studio-panel-summary">{t("ls.sections")}</summary>
              <ZonePicker template={template} frame={frame} zone={zone} onSelect={openZone} />
            </details>
            <details className="studio-panel" open>
              <summary className="studio-panel-summary">Content &amp; text</summary>
              <BoardText draft={draft} update={update} />
            </details>
            <details className="studio-panel">
              <summary className="studio-panel-summary">Images &amp; video</summary>
              <p className="zone-help">{t("ls.selectMediaBoard")}</p>
            </details>
          </div>

          <div className={step === "section" ? "studio-pane on" : "studio-pane"} data-step="section">
            <p className="studio-zone-hint studio-mobile-hint">{t("ls.selectMenuArea")}</p>
          </div>

          <div className={step === "content" ? "studio-pane on" : "studio-pane"} data-step="content">
            <p className="studio-zone-hint studio-mobile-hint">{t("ls.selectMediaArea")}</p>
          </div>

        </section>
        {editorPlacement === "left" ? <div className="studio-editor-slot">{zoneEditor}</div> : null}
        <section className="studio-controls studio-controls-end" data-testid="studio-tools-style">
          <div className={step === "style" ? "studio-pane on" : "studio-pane"} data-step="style">
            <details className="studio-panel">
              <summary className="studio-panel-summary">{t("ls.colors")}</summary>
              <div className="segment" role="group" aria-label={t("ls.palette")}>
                {(["classic", "fresh", "bold"] as const).map((palette) => (
                  <button key={palette} type="button" aria-pressed={draft.palette === palette} onClick={() => update({ ...draft, palette })}>{palette}</button>
                ))}
              </div>
              <ColorField label={t("ls.textColor")} ariaLabel={t("ls.textColor")} value={draft.textColor} fallback="#0b1220" onChange={(next) => update({ ...draft, textColor: next })} />
              <ColorField label={t("ls.menuBg")} ariaLabel={t("ls.menuBg")} value={draft.backgroundColor} fallback="#f6f9fe" onChange={(next) => update({ ...draft, backgroundColor: next })} />
              <ColorField label={t("ls.featureColor")} ariaLabel={t("ls.primaryColor")} value={draft.primaryColor} fallback="#0066ff" onChange={(next) => update({ ...draft, primaryColor: next })} />
              <ColorField label={t("ls.accentColor")} ariaLabel={t("ls.accentColor")} value={draft.accentColor} fallback="#ffd34d" onChange={(next) => update({ ...draft, accentColor: next })} />
              <div style={{ margin: "12px 0" }}>
                <p style={{ fontSize: 13, color: "#5c534c", margin: "0 0 8px" }}>{t("ls.coloursNote")}</p>
                <BrandSummary fixture={brand ?? undefined} />
                <p style={{ fontSize: 13, margin: "8px 0" }}><StudioGuardedLink href="/dashboard/account/brand-kit" className="font-semibold" style={{ color: "#1a4d8c" }}>{t("ls.openBrandKit")}</StudioGuardedLink></p>
                {!menuId ? (
                  <button type="button" className="btn btn-quiet min-h-11" onClick={() => {
                    const colors = brand?.brand ?? liveBrand.data;
                    if (!colors?.primaryColor && !colors?.accentColor) return;
                    update({ ...draft, primaryColor: colors.primaryColor || draft.primaryColor, accentColor: colors.accentColor || draft.accentColor });
                  }}>{t("ls.applyBrand")}</button>
                ) : null}
              </div>
              <button type="button" className="btn btn-quiet min-h-11" onClick={() => update({ ...draft, primaryColor: null, accentColor: null, textColor: null, backgroundColor: null })}>{t("ls.builtIn")}</button>
              <label style={fieldLabel}>{t("ls.typeSize")}
                <div className="segment" role="group" aria-label={t("ls.typeSize")}>
                  <button type="button" aria-pressed={draft.typeScale === "room"} onClick={() => update({ ...draft, typeScale: "room" })}>{t("ls.room")}</button>
                  <button type="button" aria-pressed={draft.typeScale === "counter"} onClick={() => update({ ...draft, typeScale: "counter" })}>{t("ls.counter")}</button>
                </div>
              </label>
              <p className="zone-help">{t("ls.roomNote")}</p>
              <label style={fieldLabel}>{t("ls.font")}
                <select className="field" aria-label={t("ls.font")} value={draft.font} onChange={(event) => {
                  const next = event.target.value;
                  if (!isBoardFont(next)) return;
                  // E6-F2: a body font equal to the heading font is the same as none.
                  const { bodyFont, ...rest } = draft;
                  update(bodyFont && bodyFont !== next ? { ...rest, font: next, bodyFont } : { ...rest, font: next });
                }}>
                  {BOARD_FONTS.map((font) => <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>{font.label} · {t(`font.${font.id}.hint`)}</option>)}
                </select>
              </label>
              <label style={fieldLabel}>{t("studio.bodyFont")}
                <select className="field" aria-label={t("studio.bodyFont")} value={draft.bodyFont ?? ""} onChange={(event) => {
                  const next = event.target.value;
                  const { bodyFont: _old, ...rest } = draft;
                  void _old;
                  update(isBoardFont(next) && next !== draft.font ? { ...rest, bodyFont: next } : rest);
                }}>
                  <option value="">{t("studio.bodyFontSame")}</option>
                  {BOARD_FONTS.filter((font) => font.id !== draft.font).map((font) => <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>{font.label} · {t(`font.${font.id}.hint`)}</option>)}
                </select>
              </label>
              <p className="zone-help">{t("studio.bodyFontHelp")}</p>
              <p style={{ fontSize: 13, color: "#5c534c" }}>{t("studio.fontsNote")}</p>
              <p className="zone-help">{t("ls.fitNote")}</p>
              <label style={fieldLabel}>{proportionLabel(template, t)} {Math.round(draft.split * 100)}%
                <input type="range" min={spec.min} max={spec.max} step={0.01} value={draft.split} aria-describedby="proportion-note"
                  onChange={(event) => update({ ...draft, split: Number(event.target.value) })} />
              </label>
              <p id="proportion-note" style={{ fontSize: 13, color: "#5c534c", marginTop: 0 }}>{proportionNote(template, t)}</p>
              {template === "triple-column" || template === "two-menu-promo" ? <ColumnWidths draft={draft} update={update} /> : null}
            </details>
          </div>

          <div className={step === "publish" ? "studio-pane on" : "studio-pane"} data-step="publish">
            {account?.legacy.length ? <p style={{ fontSize: 13, color: "#5c534c" }}>{t("ls.classicStay", { names: account.legacy.map((item) => item.name).join(", ") })}</p> : null}
            {accountMode ? null : (
              <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0", minHeight: 44 }}>
                <input type="checkbox" checked={videoOn && !!videoBox && !draft.videoMediaId} disabled={!videoBox || Boolean(draft.videoMediaId)} onChange={(event) => setVideoOn(event.target.checked)} />
                {t("ls.demo")}
              </label>
            )}
            <div className="studio-save-inline" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {accountMode ? <a href="/dashboard/media/menus" className="btn btn-quiet min-h-11" style={{ textDecoration: "none" }} onClick={(event) => {
                event.preventDefault();
                requestLeave(() => { if (onClose) onClose(); else window.location.assign("/dashboard/media/menus"); });
              }}>{t("ls.menuBoards")}</a> : null}
            </div>
            {note ? <p className="studio-inline-note" role="alert" style={{ fontSize: 14, color: "#5c534c" }}>{note}</p> : null}
          </div>
        </section>
        </div>

        <section
          className={step === "preview" ? "studio-canvas on" : "studio-canvas"}
          id="studio-tv-preview"
          data-testid="studio-tv-preview"
          aria-label={t("ls.canvas")}
        >
          <p className="studio-kicker">{t("ls.kicker")}</p>
          <div className="studio-canvas-stage">
            {studioBp !== "phone" || step === "preview" ? renderStage(true) : null}
          </div>
          {studioBp !== "phone" ? (
            <div className="studio-canvas-tools" id="studio-canvas-tools" data-testid="studio-canvas-tools" role="region" aria-label={t("ls.areaControls")} tabIndex={0}>
              {editorPlacement === "canvas"
                ? zoneEditor
                : <p className="studio-zone-hint">{t("ls.selectMediaHere")}</p>}
            </div>
          ) : null}
        </section>
      </div>
      <div className="studio-savebar">
        {progress || note ? <p className="studio-status" role="status">{progress || note}</p> : null}
        <nav className="studio-tabs" role="tablist" aria-label={t("ls.steps")}>
          {(["preview", "template", "section", "content", "style", "publish"] as const).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={step === id} style={{ ...chip(step === id), flex: "1 1 0", padding: "6px 2px", fontSize: 12, minHeight: 44 }} onClick={() => {
              setStep(id);
              if (id === "preview") document.getElementById("studio-tv-preview")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }}>{stepLabel(id, t)}</button>
          ))}
        </nav>
        <div className="studio-save-actions">
          {renderSaveDraft()}
          {renderPublish()}
        </div>
      </div>
      <StudioStyles />
    </main>
  );
}



function columnTemplate(template: LayoutTemplate) {
  return template === "triple-column" || template === "two-menu-promo" || template === "two-column";
}


function TemplatePicker({ template, onChoose }: { template: LayoutTemplate; onChoose: (id: LayoutTemplate) => void }) {
  return (
    <div className="template-thumbs" role="list">
      {TEMPLATES.map((id) => {
        const spec = templateSpec(id);
        const selected = id === template;
        return (
          <button
            key={id}
            type="button"
            role="listitem"
            className="template-thumb"
            aria-pressed={selected}
            aria-label={spec.name}
            onClick={() => onChoose(id)}
          >
            <span className="template-thumb-frame">
              <img src={studioTemplateThumbnailSrc(id)} alt="" />
              {selected ? <span className="template-thumb-check" aria-hidden="true">✓</span> : null}
            </span>
            <span className="template-thumb-name">{spec.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function ZonePicker({ template, frame, zone, onSelect }: {
  template: LayoutTemplate;
  frame: ReturnType<typeof frameFor>;
  zone: string;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const hits = previewHits(template, frame);
  return (
    <div className="zone-picker">
      <div className="segment" role="group" aria-label={t("ls.sections")}>
        {hits.map((hit) => (
          <button key={hit.id} type="button" aria-pressed={hit.id === zone} onClick={() => onSelect(hit.id)}>
            {zoneText(hit.label, t)}
          </button>
        ))}
      </div>
    </div>
  );
}


function SelectedZoneEditor({
  zone, template, draft, update, closeZone, account, progress, imageHref, clipUrl, videoOn, accountMode,
  isolatedPhotoLimit = false,
  sectionIndex, setSectionIndex, photoLabel, onPhoto, onVideo, removePhoto, removeVideo, setImageHref, setClipUrl, setVideoOn, setNote,
  nameCheck = false, setNameCheck = () => {},
}: {
  nameCheck?: boolean;
  setNameCheck?: (on: boolean) => void;
  zone: string;
  template: LayoutTemplate;
  draft: LayoutDocument;
  update: (next: LayoutDocument) => void;
  closeZone: () => void;
  account: AccountStudio | null;
  progress: string | null;
  imageHref: string | null;
  clipUrl: string | null;
  videoOn: boolean;
  accountMode: boolean;
  isolatedPhotoLimit?: boolean;
  sectionIndex: number;
  setSectionIndex: (index: number) => void;
  photoLabel: string;
  onPhoto: (file: File | undefined) => void;
  onVideo: (file: File | undefined) => void;
  removePhoto: () => void;
  removeVideo: () => void;
  setImageHref: (href: string | null) => void;
  setClipUrl: (href: string | null) => void;
  setVideoOn: (on: boolean) => void;
  setNote: (note: string) => void;
}) {
  const cards = useOpenItem(); // MB-1: which product card is open
  const t = useT();
  const panel = editorPanelForZone(zone);
  if (panel === "none") {
    return <p className="studio-zone-hint">{t("ls.selectArea")}</p>;
  }
  const columns = columnTemplate(template);
  const exclusive = zone === "feature" && template !== "signature";
  return (
    <div id="studio-selected-editor" className="studio-selected-editor" data-testid="studio-selected-editor" data-editor-panel={panel}>
      <ZoneHead zone={zone || "menu"} template={template} onClose={closeZone} />
      {panel === "menu" ? (
        <div className="zone-groups">
          <section className="zone-group">
            <h3>{columns ? t("ls.menuColumn") : t("ls.menuSections")}</h3>
            {(() => { const counts = menuCounts(draft.sections); return <MenuLimits sections={counts.sections} items={counts.items} maxSections={counts.maxSections} maxItems={counts.maxItems} columns={Boolean(columns)} />; })()}
            {columns ? null : (
              <div className="segment section-tabs" role="group" aria-label={t("ls.menuSections")}>
                {draft.sections.map((section, index) => (
                  <button key={index} type="button" aria-pressed={index === sectionIndex} onClick={() => setSectionIndex(index)}>
                    {section.name || t("ls.sectionN", { n: index + 1 })}
                  </button>
                ))}
              </div>
            )}
            {draft.sections.map((section, si) => {
              if (columns && si !== sectionIndex) return null;
              return (
                <fieldset key={si} className={si === sectionIndex ? "section-card section-block on" : "section-card section-block"}>
                  <legend className="section-card-legend">{columns ? t("ls.menuColumnN", { n: si + 1 }) : t("ls.sectionN", { n: si + 1 })}</legend>
                  {columns ? null : (
                    <div className="section-card-head">
                      <span className="item-limit">{t("ls.itemsOf", { n: section.items.filter((item) => item.name.trim()).length, max: MENU_LIMITS.itemsPerSection })}</span>
                      <OrderButtons className="section-order" kind="section" name={section.name} scope="studio-sections" index={si} count={draft.sections.length}
                        onMove={(dir) => {
                          cards.sectionMoved(si, dir);
                          update({ ...draft, sections: moveSection(draft.sections, si, dir) });
                          setSectionIndex(Math.max(0, Math.min(draft.sections.length - 1, si + dir)));
                        }} />
                      <button type="button" className="section-remove" aria-label={t("ls.removeSectionN", { n: si + 1 })} disabled={draft.sections.length <= 1}
                        onClick={() => {
                          cards.clear();
                          update({ ...draft, sections: draft.sections.filter((_, i) => i !== si) });
                          setSectionIndex(Math.max(0, Math.min(si, draft.sections.length - 2)));
                        }}>{t("ls.removeSection")}</button>
                    </div>
                  )}
                  <input aria-label={t("ls.sectionNameN", { n: si + 1 })} className="item-field" style={field} value={section.name} maxLength={MENU_LIMITS.sectionName}
                    onChange={(event) => update({ ...draft, sections: draft.sections.map((s, i) => i === si ? { ...s, name: event.target.value } : s) })} />
                  {section.items.map((item, ii) => {
                    const idBase = `studio-item-${si}-${ii}`;
                    const nameInvalid = nameCheck && needsName(item);
                    return (
                    <ProductCard key={ii} item={item} idBase={idBase} open={cards.isOpen(si, ii) || nameInvalid} onToggle={() => cards.toggle(si, ii)}
                      removeLabel={t("menuCard.removeLabel", { item: ii + 1, section: si + 1 })}
                      onRemove={() => { cards.clear(); update({ ...draft, sections: draft.sections.map((s, i) => i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s) }); }}
                      order={<OrderButtons kind="item" name={item.name} scope={`studio-items-${si}`} index={ii} count={section.items.length} className="item-order product-order"
                        onMove={(dir) => { cards.moved(si, ii, dir); update({ ...draft, sections: moveItem(draft.sections, si, ii, dir) }); }} />}>
                      <input id={`${idBase}-name`} aria-label={t("menuCard.nameLabel", { item: ii + 1, section: si + 1 })} className="item-name" style={field} placeholder={t("menuCard.namePlaceholder")} value={item.name} maxLength={MENU_LIMITS.itemName}
                        aria-invalid={nameInvalid || undefined} aria-describedby={nameInvalid ? `${idBase}-name-error` : undefined}
                        onChange={(event) => setItem(draft, si, ii, { name: event.target.value }, update)} />
                      <input aria-label={t("menuCard.priceLabel", { item: ii + 1, section: si + 1 })} className="item-price" style={field} placeholder="$0" value={item.price} maxLength={MENU_LIMITS.price}
                        aria-describedby={`${idBase}-price-hint`}
                        onBlur={(event) => { const next = normalizePrice(event.target.value); if (next !== item.price) setItem(draft, si, ii, { price: next }, update); if (needsName({ ...item, price: next })) setNameCheck(true); }}
                        onChange={(event) => setItem(draft, si, ii, { price: event.target.value }, update)} />
                      <input aria-label={t("menuCard.descLabel", { item: ii + 1, section: si + 1 })} className="item-desc" style={field} placeholder={t("menuCard.descPlaceholder")} value={item.description} maxLength={MENU_LIMITS.description}
                        aria-describedby={`${idBase}-desc-count`} onBlur={() => { if (needsName(item)) setNameCheck(true); }}
                        onChange={(event) => setItem(draft, si, ii, { description: event.target.value }, update)} />
                      <ItemNotes item={item} idBase={idBase} showNameError={nameCheck} />
                    </ProductCard>
                    );
                  })}
                  <button type="button" className="btn btn-quiet item-add" disabled={!canAddItem(draft.sections, si)} onClick={() => { cards.open(si, section.items.length); update({ ...draft, sections: draft.sections.map((s, i) => i === si ? { ...s, items: [...s.items, blankItem()] } : s) }); }}>
                    {canAddItem(draft.sections, si) ? t("ls.addItem") : section.items.length >= MENU_LIMITS.itemsPerSection ? t("ls.sectionFull", { max: MENU_LIMITS.itemsPerSection }) : t("ls.menuFull", { max: MENU_LIMITS.items })}
                  </button>
                  {template === "triple-column" && si === draft.sections.length - 1 ? (
                    <p className="zone-help">{t("ls.tripleNote")}</p>
                  ) : null}
                </fieldset>
              );
            })}
            {columns ? null : (
              <button type="button" className="btn btn-quiet item-add" disabled={!canAddSection(draft.sections)}
                onClick={() => { update({ ...draft, sections: [...draft.sections, { name: t("ls.section"), items: [blankItem()] }] }); setSectionIndex(draft.sections.length); }}>
                {canAddSection(draft.sections) ? t("ls.addSection", { n: draft.sections.length, max: MENU_LIMITS.sections }) : sectionLimitMessage(draft.sections, t)}
              </button>
            )}
          </section>
        </div>
      ) : null}
      {panel === "media" || panel === "background" ? (
        <div className="zone-stack">
          <ZoneMedia
            photoLabel={photoLabel}
            allowImage={panel === "background" ? true : zoneAllows(template, zone, "image")}
            allowVideo={panel === "background" ? false : zoneAllows(template, zone, "video")}
            promoArea={template === "menu-promo-67" || template === "two-menu-promo"}
            imageLimitLabel={isolatedPhotoLimit ? t("fu.limit", { mb: 1.5 }) : undefined}
            draft={draft}
            account={account}
            progress={progress}
            previewImage={imageHref}
            previewVideo={panel === "background" ? null : (clipUrl || libraryVideoUrl(account, draft.videoMediaId, !accountMode && videoOn && !draft.videoMediaId) || null)}
            videoAttached={Boolean(clipUrl || draft.videoMediaId)}
            onPhoto={onPhoto}
            onVideo={onVideo}
            removePhoto={removePhoto}
            removeVideo={removeVideo}
            update={update}
            onLibraryPhoto={(entry) => {
              if (panel === "background") {
                update(applyLibraryFile(draft, entry, "photo"));
                setImageHref(entry?.url ?? null);
                return;
              }
              const applied = applyLibraryFile(draft, entry, "photo");
              const next = placeZoneMedia(applied, "photo", applied.imageMediaId, exclusive && Boolean(entry));
              update(next);
              setImageHref(entry?.url ?? null);
              if (exclusive && entry) { setClipUrl(null); setVideoOn(false); }
              setNote(exclusive && entry && (draft.videoMediaId || clipUrl) ? t("ls.imageReplacesVideo") : "");
            }}
            onLibraryVideo={(entry) => {
              if (panel === "background") return;
              const applied = applyLibraryFile(draft, entry, "video");
              const next = placeZoneMedia(applied, "video", applied.videoMediaId, exclusive && Boolean(entry));
              update(next);
              setClipUrl(null);
              setVideoOn(Boolean(next.videoMediaId));
              if (exclusive && entry) setImageHref(null);
              setNote(exclusive && entry && (draft.imageMediaId || imageHref) ? t("ls.videoReplaces") : "");
            }}
          />
          {panel === "media" && zoneAllows(template, zone, "text") ? (
            <section className="zone-group">
              <h3>{t("ls.textSettings")}</h3>
              <label style={fieldLabel}>{template === "split-50" ? t("ls.rightTitle") : template === "signature" ? t("ls.sideTitle") : t("ls.featureTitle")}
                <input aria-label={template === "split-50" ? t("ls.rightTitle") : t("ls.featureTitle")} style={field} value={draft.featureTitle} maxLength={40}
                  onChange={(event) => update({ ...draft, featureTitle: event.target.value })} />
              </label>
              <label style={fieldLabel}>{template === "split-50" ? t("ls.rightDetail") : template === "signature" ? t("ls.sideDetail") : t("ls.featureDetail")}
                <input aria-label={template === "split-50" ? t("ls.rightDetail") : t("ls.featureDetail")} style={field} value={draft.featureDetail} maxLength={80}
                  onChange={(event) => update({ ...draft, featureDetail: event.target.value })} />
              </label>
            </section>
          ) : null}
          {panel === "background" ? (
            <ColorField label={t("ls.menuBg")} ariaLabel={t("ls.menuBg")} value={draft.backgroundColor} fallback="#f6f9fe" onChange={(next) => update({ ...draft, backgroundColor: next })} />
          ) : null}
          {template === "triple-column" && zone === "photo" ? (
            <FileUploadControl kind="image" accept="image/jpeg,image/png,image/webp" limitLabel={isolatedPhotoLimit ? t("fu.limit", { mb: 1.5 }) : undefined} onFiles={(files) => onPhoto(files[0])} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function libraryVideoUrl(account: AccountStudio | null, mediaId: string | null, demo: boolean) {
  const file = account?.library.find((item) => item.id === mediaId && item.kind === "video");
  if (file?.url) return file.url;
  return demo ? "/layout-studio/media/promo" : "";
}

function Stage({ svg, video, videoSrc, label, hits, active, onHit }: {
  svg: string;
  video: { x: number; y: number; w: number; h: number } | null;
  videoSrc: string;
  label: string;
  hits: { id: string; label: string; box: { x: number; y: number; w: number; h: number } }[];
  active: string;
  onHit: (id: string) => void;
}) {
  const t = useT();
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ scale: 1, left: 0, top: 0 });
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const measure = () => {
      const next = containedBoard(node.clientWidth, node.clientHeight);
      setFrame({ scale: next.scale, left: next.left, top: next.top });
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(node);
    return () => watch.disconnect();
  }, []);
  return (
    <figure className="preview-frame">
      {label ? <figcaption style={{ color: "#f3ecdf", padding: "10px 14px", fontSize: 13 }}>{label}</figcaption> : null}
      <div ref={frameRef} style={{ position: "relative", aspectRatio: "16 / 9", overflow: "hidden" }}>
        <div style={{ position: "absolute", width: 1920, height: 1080, left: frame.left, top: frame.top, transform: `scale(${frame.scale})`, transformOrigin: "top left" }}>
          <div dangerouslySetInnerHTML={{ __html: svg }} />
          {video ? (
            <video
              src={videoSrc}
              muted
              autoPlay
              loop
              playsInline
              {...{ "webkit-playsinline": "webkit-playsinline" }}
              style={{ position: "absolute", left: video.x, top: video.y, width: video.w, height: video.h, objectFit: "cover", background: "transparent", pointerEvents: "none" }}
            />
          ) : null}
        </div>
        {hits.map((hit) => (
          <button
            key={hit.id}
            type="button"
            className="zone-hit"
            aria-label={t("ls.editZone", { zone: zoneText(hit.label, t) })}
            aria-pressed={active === hit.id}
            onClick={() => onHit(hit.id)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onHit(hit.id); } }}
            style={{
              position: "absolute",
              left: frame.left + hit.box.x * frame.scale,
              top: frame.top + hit.box.y * frame.scale,
              width: Math.max(44, hit.box.w * frame.scale),
              height: Math.max(44, hit.box.h * frame.scale),
              // Selected area: a clear outline, no tint over the board colours (QA U1-10).
              background: "transparent",
              border: active === hit.id ? "3px solid #0066ff" : "2px solid rgba(255,255,255,0.92)",
              boxShadow: active === hit.id ? "0 0 0 2px #ffffff, inset 0 0 0 1px rgba(255,255,255,0.9)" : "inset 0 0 0 1px rgba(0,0,0,0.55)",
              cursor: "pointer", padding: 0, color: "#fff",
            }}
          >
            <span style={{ position: "absolute", left: 4, top: hit.id === "menu" || hit.id.startsWith("column-") ? undefined : 4, bottom: hit.id === "menu" || hit.id.startsWith("column-") ? 4 : undefined, maxWidth: "calc(100% - 8px)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: active === hit.id ? "#0066ff" : "rgba(0,0,0,0.45)", borderRadius: 6, padding: "2px 6px", fontSize: 11, fontWeight: 700, lineHeight: "14px" }}>{zoneText(hit.label, t)}</span>
          </button>
        ))}
      </div>
    </figure>
  );
}


function BoardText({ draft, update }: { draft: LayoutDocument; update: (next: LayoutDocument) => void }) {
  const t = useT();
  return (
    <section className="zone-group board-text">
      <h3>{t("ls.textSettings")}</h3>
      <label style={fieldLabel}>{t("ls.title")}
        <input style={field} aria-label={t("ls.title")} value={draft.title} maxLength={MENU_LIMITS.title} onChange={(event) => update({ ...draft, title: event.target.value })} />
      </label>
      <label style={fieldLabel}>{t("ls.subtitle")}
        <input style={field} aria-label={t("ls.subtitle")} value={draft.subtitle} maxLength={MENU_LIMITS.subtitle} onChange={(event) => update({ ...draft, subtitle: event.target.value })} />
      </label>
      <label style={fieldLabel}>{t("ls.footer")}
        <input style={field} aria-label={t("ls.footer")} value={draft.footer} maxLength={MENU_LIMITS.footer} onChange={(event) => update({ ...draft, footer: event.target.value })} />
      </label>
    </section>
  );
}

function ZoneHead({ zone, template, onClose }: { zone: string; template: LayoutTemplate; onClose: () => void }) {
  const t = useT();
  const caps = zoneCapabilities(template).find((item) => item.id === zone);
  return (
    <header className="zone-head">
      <div>
        <h2>{zoneText(zoneLabel(zone, template, t), t)}</h2>
        <div className="zone-chips">
          {caps?.text ? <span className="badge">{t("ls.text")}</span> : null}
          {caps?.image ? <span className="badge">{t("ls.image")}</span> : null}
          {caps?.video ? <span className="badge">{t("ls.video")}</span> : null}
        </div>
      </div>
      <button type="button" className="btn btn-quiet" onClick={onClose} aria-label={t("ls.closeAria")}>{t("ls.close")}</button>
    </header>
  );
}

function enlargePreviewText(svg: string) {
  return svg.replace(/font-size="([\d.]+)"/g, (_match, size) => `font-size="${Math.round(Number(size) * 1.12)}"`);
}

function boardChoice(board: AccountBoard, locale: string = "en") {
  const layout = templateSpec(board.document.template).name;
  const when = board.updatedAt ? new Intl.DateTimeFormat(locale === "es" ? "es" : "en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(board.updatedAt)) : "";
  return [board.name, layout, when].filter(Boolean).join(" · ");
}

/** Zone names come from lib/layout-studio.ts in English; the editor shows them through t() (I18N-3). */
function zoneText(label: string, t: T): string {
  const bare = label.replace(/^Edit /, "");
  const name = bare.charAt(0).toUpperCase() + bare.slice(1);
  const key = `zone.${name.toLowerCase().replace(/\s+/g, "-")}`;
  return hasKey(key) ? t(key) : name;
}

function zoneLabel(zone: string, template: LayoutTemplate, t: T) {
  return zoneCapabilities(template).find((item) => item.id === zone)?.label ?? t("ls.section");
}

function zoneAllows(template: LayoutTemplate, zone: string, kind: "image" | "video" | "text") {
  return zoneCapabilities(template).find((item) => item.id === zone)?.[kind] === true;
}

function ZoneMedia({
  photoLabel, allowImage, allowVideo, promoArea, imageLimitLabel, draft, account, previewImage, previewVideo, videoAttached, onPhoto, onVideo, removePhoto, removeVideo, update, onLibraryPhoto, onLibraryVideo,
}: {
  photoLabel: string;
  allowImage: boolean;
  allowVideo: boolean;
  promoArea?: boolean;
  imageLimitLabel?: string;
  draft: LayoutDocument;
  account: AccountStudio | null;
  progress: string | null;
  previewImage?: string | null;
  previewVideo?: string | null;
  videoAttached?: boolean;
  onPhoto: (file: File | undefined) => void;
  onVideo: (file: File | undefined) => void;
  removePhoto: () => void;
  removeVideo: () => void;
  update: (next: LayoutDocument) => void;
  onLibraryPhoto: (entry: AccountLibraryFile | null) => void;
  onLibraryVideo: (entry: AccountLibraryFile | null) => void;
}) {
  const t = useT();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const hasImage = allowImage && Boolean(draft.imageMediaId || previewImage);
  const hasVideo = allowVideo && Boolean(draft.videoMediaId || previewVideo || videoAttached);
  const imageLabel = hasImage && !hasVideo ? t("ls.replaceImage") : t("ls.uploadImage");
  const videoLabel = hasVideo ? t("ls.replaceVideo") : t("ls.uploadVideo");
  const imagePrimary = allowImage && !hasVideo;
  const videoPrimary = allowVideo && (hasVideo || !allowImage);
  const imageFile = account?.library.find((item) => item.id === draft.imageMediaId);
  const videoFile = account?.library.find((item) => item.id === draft.videoMediaId);
  const thumbVideo = previewVideo || videoFile?.url || "";
  const thumbImage = previewImage || imageFile?.url || "";
  return (
    <div className="zone-groups">
      <section className="zone-group">
        <h3>{t("ls.media")}</h3>
        <p className="zone-help">{photoLabel}. {allowImage && allowVideo ? (promoArea ? t("ls.promoHint") : t("ls.imageOrVideo")) : allowVideo ? t("ls.oneVideo") : t("ls.imageOnly")}</p>
        {hasVideo && allowVideo ? (
          <div className="media-card">
            {thumbVideo ? <video className="media-thumb" muted playsInline preload="auto" src={thumbVideo.includes("#") || thumbVideo.startsWith("blob:") ? thumbVideo : `${thumbVideo}#t=0.1`} onLoadedData={(event) => { const node = event.currentTarget; if (node.currentTime < 0.05) node.currentTime = 0.1; }} /> : <div className="media-thumb" />}
            <div className="media-meta">
              <p className="media-name">{videoFile?.name || t("ls.video")}</p>
              <p className="zone-help">{t("ls.video")}</p>
            </div>
            <button type="button" className="remove-btn" onClick={removeVideo}>{t("ls.removeVideo")}</button>
          </div>
        ) : hasImage ? (
          <div className="media-card">
            {thumbImage ? <img className="media-thumb" alt="" src={thumbImage} /> : <div className="media-thumb" />}
            <div className="media-meta">
              <p className="media-name">{imageFile?.name || t("ls.image")}</p>
              <p className="zone-help">{t("ls.image")}</p>
            </div>
            <button type="button" className="remove-btn" onClick={removePhoto}>{t("ls.removeImage")}</button>
          </div>
        ) : <p className="zone-help">{t("ls.nothingHere")}</p>}
        <div className={allowImage && allowVideo ? "media-row" : "media-row single"}>
          {allowImage ? (
            <FileUploadControl
              kind="image"
              label={imageLabel}
              accept="image/jpeg,image/png,image/webp"
              limitLabel={imageLimitLabel}
              buttonClass={`btn cursor-pointer min-h-11 ${imagePrimary ? "btn-primary" : "btn-quiet"}`}
              onFiles={(files) => onPhoto(files[0])}
            />
          ) : null}
          {allowVideo ? (
            <FileUploadControl
              kind="video"
              label={videoLabel}
              buttonClass={`btn cursor-pointer min-h-11 ${videoPrimary ? "btn-primary" : "btn-quiet"}`}
              onFiles={(files) => onVideo(files[0])}
            />
          ) : null}
        </div>
        {hasVideo && allowImage ? <p className="zone-help">{t("ls.replacesVideo")}</p> : null}
        {hasImage && !hasVideo && allowVideo ? <p className="zone-help">{t("ls.replacesImage")}</p> : null}
        {account ? <button type="button" className="btn btn-quiet library-btn" aria-expanded={libraryOpen} onClick={() => setLibraryOpen((open) => !open)}>{t("ls.chooseLibrary")}</button> : null}
        {libraryOpen && account ? (
          <div className="media-actions">
            {allowImage ? <label className="zone-help">{t("ls.image")}
              <select className="field" aria-label={t("ls.chooseImage")} value={hasVideo && allowVideo ? "" : (draft.imageMediaId ?? "")} onChange={(event) => onLibraryPhoto(account.library.find((item) => item.id === event.target.value) ?? null)}>
                <option value="">{t("ls.noPhoto")}</option>
                {account.library.filter((item) => item.kind === "image").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label> : null}
            {allowVideo ? (
              <label className="zone-help">{t("ls.video")}
                <select className="field" aria-label={t("ls.chooseVideo")} value={draft.videoMediaId ?? ""} onChange={(event) => onLibraryVideo(account.library.find((item) => item.id === event.target.value) ?? null)}>
                  <option value="">{t("ls.noVideo")}</option>
                  {account.library.filter((item) => item.kind === "video").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
        {allowVideo ? <p className="zone-help">{hasVideo ? t("ls.hasVideo") : t("ls.playsVideo")}</p> : null}
      </section>
      <section className="zone-group">
        <h3>{t("ls.displaySettings")}</h3>
        <div className="segment" role="group" aria-label={t("ls.howFits")}>
          <button type="button" aria-pressed={draft.imageFit !== "contain"} onClick={() => update({ ...draft, imageFit: "cover" })}>{t("ls.fill")}</button>
          <button type="button" aria-pressed={draft.imageFit === "contain"} onClick={() => update({ ...draft, imageFit: "contain" })}>{t("ls.fit")}</button>
        </div>
        <p className="zone-help">{t("ls.fillFitNote")}</p>
        <label className="zone-help">{t("ls.position")}
          <select className="field" aria-label={t("ls.photoPosition")} value={draft.imageAnchor} onChange={(event) => update({ ...draft, imageAnchor: anchorValue(event.target.value) })}>
            <option value="center">{t("ls.center")}</option>
            <option value="top">{t("ls.top")}</option>
            <option value="bottom">{t("ls.bottom")}</option>
            <option value="left">{t("ls.left")}</option>
            <option value="right">{t("ls.right")}</option>
          </select>
        </label>
      </section>
    </div>
  );
}

function setItem(draft: LayoutDocument, si: number, ii: number, patch: Partial<LayoutItem>, update: (next: LayoutDocument) => void) {
  update({
    ...draft,
    sections: draft.sections.map((section, i) => i === si ? {
      ...section,
      items: section.items.map((item, j) => j === ii ? { ...item, ...patch } : item),
    } : section),
  });
}

function stepLabel(step: StudioStep, t: T) {
  if (step === "template") return t("ls.template");
  if (step === "section") return t("ls.section");
  if (step === "content") return t("ls.content");
  if (step === "style") return t("ls.style");
  if (step === "preview") return t("ls.preview");
  return t("ls.publish");
}

function anchorValue(value: string): LayoutDocument["imageAnchor"] {
  if (value === "top" || value === "bottom" || value === "left" || value === "right") return value;
  return "center";
}

function ColumnWidths({ draft, update }: { draft: LayoutDocument; update: (next: LayoutDocument) => void }) {
  const t = useT();
  const widths = draft.columnWidths ?? [draft.split, (1 - draft.split) / 2, (1 - draft.split) / 2];
  function setWidth(index: number, next: number) {
    const current: [number, number, number] = [widths[0], widths[1], widths[2]];
    current[index] = Math.min(0.6, Math.max(0.2, next));
    const others = [0, 1, 2].filter((item) => item !== index);
    const remain = 1 - current[index];
    const otherSum = current[others[0]] + current[others[1]] || 1;
    current[others[0]] = remain * current[others[0]] / otherSum;
    current[others[1]] = remain - current[others[0]];
    update({ ...draft, columnWidths: current });
  }
  return (
    <fieldset style={{ border: "1px solid #ddd4c6", borderRadius: 12, padding: 12 }}>
      <legend>{t("ls.columnWidths")}</legend>
      {widths.map((width, index) => (
        <label key={index} style={fieldLabel}>{t("ls.columnN", { n: index + 1 })} {Math.round(width * 100)}%
          <input aria-label={t("ls.columnWidthN", { n: index + 1 })} type="range" min={0.2} max={0.6} step={0.01} value={width} onChange={(event) => setWidth(index, Number(event.target.value))} />
        </label>
      ))}
      <p style={{ fontSize: 13, color: "#5c534c" }}>{t("ls.columnsNote")}</p>
    </fieldset>
  );
}

function proportionLabel(template: LayoutTemplate, t: T) {
  if (template === "menu-banner") return t("ls.bannerHeight");
  if (template === "triple-column") return t("ls.firstColumn");
  if (template === "two-menu-promo") return t("ls.firstMenuColumn");
  if (template === "two-column") return t("ls.firstColumn");
  if (template === "signature") return t("ls.cardWidth");
  if (template === "split-50") return t("ls.leftSide");
  return t("ls.menuWidth");
}

function proportionNote(template: LayoutTemplate, t: T) {
  if (template === "triple-column") return t("ls.pTriple");
  if (template === "two-menu-promo") return t("ls.pTwoPromo");
  if (template === "two-column") return t("ls.pTwoCol");
  if (template === "menu-banner") return t("ls.pBanner");
  if (template === "menu-promo-67") return t("ls.pPromo67");
  if (template === "split-50") return t("ls.pSplit");
  return t("ls.pSignature");
}

function chip(active: boolean): CSSProperties {
  return {
    border: active ? "2px solid #1a1614" : "1px solid #ddd4c6",
    background: "#fff",
    borderRadius: 999,
    padding: "8px 12px",
    cursor: "pointer",
  };
}

const field: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #ddd4c6", borderRadius: 8, padding: "8px 10px", font: "inherit" };
const fieldLabel: CSSProperties = { display: "grid", gap: 4, margin: "10px 0", fontSize: 14 };
