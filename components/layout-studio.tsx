"use client";
import { FileUploadControl } from "@/components/file-upload";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  accountSaveBody, applyLibraryFile, boardAfterReload, freshBoard, placeZoneMedia, readAccountStudio,
  type AccountBoard, type AccountLibraryFile, type AccountStudio,
} from "@/lib/layout-account";
import {
  containedBoard, frameFor, layoutSvg, mediaVideoBox, MENU_LIMITS, parseLayout, sampleLayout, templateSpec, zoneCapabilities,
  type LayoutDocument, type LayoutItem, type LayoutTemplate,
} from "@/lib/layout-studio";
import {
  editorStateAfterScopeChange, loadBrowserStudioState, originAfterScopeResolves, resolveStudioScope, sameStudioScope,
  saveAccountGuard, saveShouldWaitForScope, signedInPreviewLoad, writeStudioDraft, writeStudioPublished,
  type StudioScope,
} from "@/lib/layout-studio-draft";
import { editorPanelForZone, keepDraftOnZoneChange, previewHits } from "@/lib/layout-studio-editor";
import { api, authToken, uploadForm, useApi } from "@/lib/api";
import { blobToBase64, prepareVideo, uploadToSignedUrl } from "@/lib/prepare-video";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { BrandSummary, type BrandKitFixture } from "@/components/brand-kit";
import { ColorField } from "@/components/color-field";
import { confirmDiscardUnsaved, hasUnsavedEdits, PROMO_AREA_HINT } from "@/lib/menu-board-unify";
import { publishSavedCopy } from "@/lib/screen-actions-ui";
import { studioTemplateThumbnailSrc } from "@/lib/layout-thumbnails";
import type { Brand } from "@/lib/brand-kit";

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
  const accountMode = mode === "account";
  const startingTemplate = initialTemplate ?? "menu-promo-67";
  const [template, setTemplate] = useState<LayoutTemplate>(startingTemplate);
  const [draft, setDraft] = useState<LayoutDocument>(() => sampleLayout(startingTemplate));
  const [imageHref, setImageHref] = useState<string | null>(null);
  const [videoOn, setVideoOn] = useState(true);
  const [published, setPublished] = useState<Snapshot | null>(null);
  const [account, setAccount] = useState<AccountStudio | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [boardName, setBoardName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [phonePreview, setPhonePreview] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [note, setNote] = useState(accountMode || fixture ? "" : "This browser copy does not write an account.");
  const spec = templateSpec(template);
  const frame = frameFor(draft.template, draft.split, draft.columnWidths);
  const [step, setStep] = useState<StudioStep>("template");
  const [zone, setZone] = useState(initialZone || (startingTemplate === "triple-column" || startingTemplate === "two-menu-promo" || startingTemplate === "two-column" ? "column-0" : "menu"));
  const [sectionIndex, setSectionIndex] = useState(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
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
  function markClean(state: CleanEdit) { cleanRef.current = state; }
  function currentEdit(): CleanEdit {
    return { menuId, boardName, template, draft, imageHref, clipUrl, videoOn };
  }
  function studioIsDirty(): boolean {
    return cleanRef.current != null && hasUnsavedEdits(currentEdit(), cleanRef.current);
  }

  /** Leave the editor (back, or the Menu boards link). Prompts only when there are unsaved changes. */
  function requestLeave(after: () => void) {
    if (!confirmDiscardUnsaved(studioIsDirty())) return;
    after();
  }
  const liveBrand = useApi<Brand>(accountMode && !fixture && !brand ? "/api/brand" : null);
  const svg = useMemo(() => layoutSvg(draft, { imageHref }), [draft, imageHref]);
  const previewMarkup = phonePreview ? enlargePreviewText(svg) : svg;
  const videoBox = mediaVideoBox(draft);
  const librarySrc = libraryVideoUrl(account, draft.videoMediaId, !accountMode && videoOn && !draft.videoMediaId && !clipUrl);
  const zoneSrc = clipUrl || librarySrc || "/layout-studio/media/promo";
  const showZone = Boolean(videoBox) && (accountMode ? Boolean(clipUrl || (draft.videoMediaId && librarySrc)) : Boolean(clipUrl) || videoOn || Boolean(draft.videoMediaId));

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
        setNote("Switched accounts. A new board is open.");
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
        setNote("Restored the draft stored in this browser.");
      }
      if (loaded.published) setPublished(loaded.published);
    } catch { /* a bad draft is ignored */ }
  }, [accountMode, fixture, scope]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 860px)");
    const apply = () => setPhonePreview(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

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
        setMenuId(null);
        setBoardName(created.name);
        setTemplate(created.document.template);
        setDraft(created.document);
        setImageHref(null);
        setVideoOn(false);
        markClean({
          menuId: null,
          boardName: created.name,
          template: created.document.template,
          draft: created.document,
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
        if (!loaded) { setNote("Couldn't read this account."); return; }
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
    if (!confirmDiscardUnsaved(studioIsDirty())) return;
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
    if (!alreadyConfirmed && !confirmDiscardUnsaved(studioIsDirty())) return;
    const created = freshBoard(account?.boards.length ?? 0, window.prompt("Name this board", freshBoard(account?.boards.length ?? 0).name));
    applyFresh(created, scopeRef.current);
    setNote("");
  }

  function applyFresh(created: { name: string; document: LayoutDocument }, nextScope: StudioScope | null) {
    setBoardName(created.name);
    setMenuId(null);
    setTemplate(created.document.template);
    setDraft(created.document);
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
      template: created.document.template,
      draft: created.document,
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
    setTemplate(next);
    setDraft(sample);
    setImageHref(null);
    setClipUrl(null);
    setZone(next === "triple-column" || next === "two-menu-promo" || next === "two-column" ? "column-0" : "menu");
    setSectionIndex(0);
    setVideoOn(accountMode ? false : frameFor(next, sample.split).video !== null);
  }

  function update(next: LayoutDocument) {
    setDraft(next);
    if (saveLock.current) return;
    setNote("Editing the draft. It is not on a screen.");
  }

  function checkedDraft(): LayoutDocument | null {
    const parsed = parseLayout(draft);
    if (!parsed.ok) { setNote(parsed.error); return null; }
    return parsed.value;
  }

  function saveDraft() {
    const doc = checkedDraft();
    if (!doc) return;
    if (!scope) {
      setNote("Sign in to keep a draft in this browser. An unscoped copy was not stored.");
      return;
    }
    const snapshot: Snapshot = { doc, imageHref, videoOn: videoOn && !!videoBox };
    writeStudioDraft(window.localStorage, scope, { ...snapshot, boardId: menuId });
    setDraft(doc);
    setOrigin(scope);
    setNote("Draft kept in this browser. No account was written.");
    markClean({ ...currentEdit(), draft: doc });
  }

  function publish() {
    const doc = checkedDraft();
    if (!doc) return;
    if (!scope) {
      setNote("Sign in to publish a preview in this browser. An unscoped copy was not stored.");
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
    setNote("Published preview is frozen in this browser. It was not sent to an account or a screen.");
    markClean({ ...currentEdit(), draft: doc, videoOn: videoOn && !!box });
  }

  async function reloadAccount(preferId: string | null, keepUnsaved = false) {
    const loaded = readAccountStudio(await api<unknown>("/api/layout-studio"));
    if (!loaded) throw new Error("Couldn't reload the account.");
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
    if (fixture) {
      setNote(saveMode === "publish" ? "Preview only — nothing was published." : "Preview only — nothing was saved.");
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
      setNote("Confirming this account… try saving again in a moment.");
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
    setNote(saveMode === "publish" ? "Publishing…" : "Saving draft…");
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
        setNote("Draft saved on this account. Screens were not moved.");
      } else if (screenId) {
        if (!board?.playlistId) {
          setNote("The board was saved, but it has no playlist, so this screen was not changed.");
        } else {
          await api("/api/layout-studio/assign", { method: "POST", body: JSON.stringify({ menuId: board.id, displayId: screenId }) });
          setNote(publishSavedCopy({
            online: screenOnline ?? false,
            connected: screenConnected ?? true,
          }));
        }
      } else if (board?.playlistId) {
        setNote("Published to this account. Screens already playing this board will update when they are online.");
      } else {
        setNote("The board was saved, but publishing did not create a playlist.");
      }
    } catch (err) {
      setNote((err as Error).message || (saveMode === "publish" ? "Couldn't publish that board." : "Couldn't save that draft."));
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
    }
  }

  function onPhoto(file: File | undefined) {
    if (!file) { removePhoto(); return; }
    const imageOk = !file.type || file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp" || /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!imageOk) { setNote("Use a JPEG, PNG, or WebP from your camera roll. This photo's format is not supported."); return; }
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
      if (file.size > ISOLATED_STUDIO_PHOTO_MAX_BYTES) { setNote("Use a photo under 1.5 MB."); setImageHref(null); return; }
      const reader = new FileReader();
      reader.onload = () => setImageHref(typeof reader.result === "string" ? reader.result : local);
      reader.readAsDataURL(file);
      setNote(replacedVideo ? "Image replaces the video in this zone." : "Photo is in the preview only. It was not uploaded to the library.");
      return;
    }
    setProgress("Uploading…");
    const form = new FormData();
    form.set("file", file);
    form.set("name", file.name);
    const send = sessionToken
      ? uploadForm("/api/media", form, sessionToken, (percent) => setProgress(percent >= 99 ? "Processing…" : "Uploading…"))
      : authToken().then((token) => uploadForm("/api/media", form, token, (percent) => setProgress(percent >= 99 ? "Processing…" : "Uploading…")));
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
      setNote(replacedVideo ? "Image replaces the video in this zone." : "Upload complete.");
    }).catch((err: Error) => {
      setProgress(null);
      setNote(err.message || "Couldn't upload that photo.");
    });
  }

  function removePhoto() {
    setImageHref(null);
    update({ ...draft, imageMediaId: null });
    setNote("Photo removed from this board.");
  }

  async function onVideo(file: File | undefined) {
    if (!file) return;
    if (!videoBox || zone === "photo" || zone === "background" || zone === "menu" || zone.startsWith("column-")) {
      setNote("This zone does not play video. A board has one video, and only the promotion, banner, or side strip can hold it.");
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
      setNote(replacedImage ? "Video replaces the image in this zone. Sign in to save it to the library." : "Video is in the preview. Sign in to add it to your library.");
      return;
    }
    setProgress("Uploading…");
    try {
      const prepared = await prepareVideo(file);
      const signed = await api<{ mediaId: string; signedUrl: string; token: string }>("/api/media/upload", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, sizeBytes: file.size }),
      });
      await uploadToSignedUrl(signed.signedUrl, file, (percent) => {
        setProgress(percent >= 99 ? "Processing…" : "Uploading…");
      }, file.name, signed.token);
      setProgress("Processing…");
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
      setNote(replacedImage ? "Video replaces the image in this zone." : "Upload complete.");
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
    setNote("Video removed. A board plays one video.");
  }

  const activeSection = Math.min(sectionIndex, Math.max(0, draft.sections.length - 1));
  const photoLabel = zone === "photo" || zone === "background" || template === "signature" ? "Background image" : "Feature photo";

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
  const zoneEditor = (
    <SelectedZoneEditor
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
    />
  );
  function renderSaveDraft() {
    return accountMode || account
      ? <button type="button" className="btn btn-quiet min-h-11" disabled={saving !== null} onClick={() => { void saveAccount("draft"); }}>{saving === "draft" ? "Saving…" : "Save draft"}</button>
      : <button type="button" className="btn btn-quiet min-h-11" onClick={saveDraft}>Save draft</button>;
  }
  function renderPublish() {
    return accountMode || account
      ? <button type="button" className="btn btn-primary min-h-11" disabled={saving !== null} onClick={() => { void saveAccount("publish"); }}>{saving === "publish" ? "Publishing…" : "Publish"}</button>
      : <button type="button" className="btn btn-primary min-h-11" onClick={publish}>Publish preview</button>;
  }
  function renderPreviewButton() {
    return accountMode
      ? (
        <button type="button" className="btn btn-quiet min-h-11" onClick={() => {
          setStep("preview");
          document.getElementById("studio-tv-preview")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }}>Preview</button>
      )
      : <a href="/layout-studio/player" className="btn btn-quiet min-h-11" style={{ textDecoration: "none" }}>Preview</a>;
  }

  return (
    <main className={zone && step !== "template" ? "studio-app zone-open" : "studio-app"} style={{ minHeight: embedded ? undefined : "100vh", background: embedded ? "transparent" : "#f4f7fb", color: "#0b1220", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }} data-embedded={embedded ? "true" : undefined} data-step={step}>
      <header className="studio-toolbar">
        <div className="studio-toolbar-lead">
          {onClose ? <button type="button" className="studio-back" onClick={() => requestLeave(onClose)}>Back to menu boards</button> : null}
          <div className="studio-page-title">
            {renaming && account ? (
              <input aria-label="Board name" className="studio-title-input" value={boardName} maxLength={80} autoFocus
                onChange={(event) => setBoardName(event.target.value)}
                onBlur={() => setRenaming(false)}
                onKeyDown={(event) => { if (event.key === "Enter") setRenaming(false); }} />
            ) : (
              <h1 className="studio-title">
                <span className="studio-title-text">{account ? (boardName || (menuId ? "Untitled board" : "New menu board")) : (embedded ? (menuId ? "Edit menu board" : "New menu board") : "Layout Studio")}</span>
                {account ? <button type="button" className="studio-rename" aria-label="Rename board" onClick={() => setRenaming(true)} title="Rename board"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg></button> : null}
              </h1>
            )}
          </div>
          {account ? (
            <div className="board-bar">
              <select aria-label="Switch board" className="board-switch" value={menuId ?? ""} onChange={(event) => selectBoard(event.target.value)}>
                {menuId ? null : <option value="">{boardName || "Untitled board"}</option>}
                {account.boards.map((board) => <option key={board.id} value={board.id}>{board.id === menuId ? boardChoice({ ...board, name: boardName || board.name }) : boardChoice(board)}</option>)}
              </select>
              <button type="button" className="btn btn-quiet board-new" onClick={() => newBoard()}>New board</button>
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
      <div className="studio-grid">
        <div className="studio-left">
        <section className="studio-controls" data-testid="studio-tools">
          {screenId ? <p style={{ fontSize: 14 }}>This edit is for one screen. Publish assigns the board to that screen and leaves the others as they are.</p> : null}

          <div className={step === "template" ? "studio-pane on" : "studio-pane"} data-step="template">
            <details className="studio-panel" open>
              <summary className="studio-panel-summary">Layout</summary>
              <TemplatePicker template={template} onChoose={choose} />
            </details>
            <details className="studio-panel" open>
              <summary className="studio-panel-summary">Sections</summary>
              <ZonePicker template={template} frame={frame} zone={zone} onSelect={openZone} />
            </details>
            <details className="studio-panel" open>
              <summary className="studio-panel-summary">Content &amp; text</summary>
              <BoardText draft={draft} update={update} />
            </details>
            <details className="studio-panel">
              <summary className="studio-panel-summary">Images &amp; video</summary>
              <p className="zone-help">Select a photo or video area on the board to choose, replace, or remove media. The editor opens below.</p>
            </details>
          </div>

          <div className={step === "section" ? "studio-pane on" : "studio-pane"} data-step="section">
            <p className="studio-zone-hint studio-mobile-hint">Select a menu area in the preview. Its editor opens under the board.</p>
          </div>

          <div className={step === "content" ? "studio-pane on" : "studio-pane"} data-step="content">
            <p className="studio-zone-hint studio-mobile-hint">Select a photo or video area in the preview. Choose, replace, or remove media under the board.</p>
          </div>

        </section>
        <div className="studio-editor-slot">{zoneEditor}</div>
        <section className="studio-controls" data-testid="studio-tools-style">
          <div className={step === "style" ? "studio-pane on" : "studio-pane"} data-step="style">
            <details className="studio-panel">
              <summary className="studio-panel-summary">Colors &amp; style</summary>
              <div className="segment" role="group" aria-label="Palette">
                {(["classic", "fresh", "bold"] as const).map((palette) => (
                  <button key={palette} type="button" aria-pressed={draft.palette === palette} onClick={() => update({ ...draft, palette })}>{palette}</button>
                ))}
              </div>
              <ColorField label="Text color" ariaLabel="Text color" value={draft.textColor} fallback="#0b1220" onChange={(next) => update({ ...draft, textColor: next })} />
              <ColorField label="Menu background" ariaLabel="Menu background" value={draft.backgroundColor} fallback="#f6f9fe" onChange={(next) => update({ ...draft, backgroundColor: next })} />
              <ColorField label="Feature color" ariaLabel="Primary color" value={draft.primaryColor} fallback="#0066ff" onChange={(next) => update({ ...draft, primaryColor: next })} />
              <ColorField label="Accent color" ariaLabel="Accent color" value={draft.accentColor} fallback="#ffd34d" onChange={(next) => update({ ...draft, accentColor: next })} />
              <div style={{ margin: "12px 0" }}>
                <p style={{ fontSize: 13, color: "#5c534c", margin: "0 0 8px" }}>Colours come from your Brand Kit. There is no separate brand form on this page.</p>
                <BrandSummary fixture={brand ?? undefined} />
                <p style={{ fontSize: 13, margin: "8px 0" }}><a href="/dashboard/account/brand-kit" className="font-semibold" style={{ color: "#1a4d8c" }}>Open Brand Kit</a></p>
                <button type="button" className="btn btn-quiet min-h-11" onClick={() => {
                  const colors = brand?.brand ?? liveBrand.data;
                  if (!colors?.primaryColor && !colors?.accentColor) return;
                  update({ ...draft, primaryColor: colors.primaryColor || draft.primaryColor, accentColor: colors.accentColor || draft.accentColor });
                }}>Use Brand Kit colors on this board</button>
              </div>
              <button type="button" className="btn btn-quiet min-h-11" onClick={() => update({ ...draft, primaryColor: null, accentColor: null, textColor: null, backgroundColor: null })}>Use built-in colors</button>
              <label style={fieldLabel}>Type size
                <div className="segment" role="group" aria-label="Type size">
                  <button type="button" aria-pressed={draft.typeScale === "room"} onClick={() => update({ ...draft, typeScale: "room" })}>Room</button>
                  <button type="button" aria-pressed={draft.typeScale === "counter"} onClick={() => update({ ...draft, typeScale: "counter" })}>Counter</button>
                </div>
              </label>
              <p className="zone-help">Room is for a television. Counter is slightly denser.</p>
              <label style={fieldLabel}>Font
                <div className="segment" role="group" aria-label="Font">
                  <button type="button" aria-pressed={draft.font === "inter"} onClick={() => update({ ...draft, font: "inter" })}>Inter</button>
                  <button type="button" aria-pressed={draft.font === "noto-serif"} onClick={() => update({ ...draft, font: "noto-serif" })}>Noto Serif</button>
                </div>
              </label>
              <p style={{ fontSize: 13, color: "#5c534c" }}>Inter and Noto Serif on this page are the same files drawn into the published image.</p>
              <label style={fieldLabel}>Photo fit
                <div className="segment" role="group" aria-label="Photo fit">
                  <button type="button" aria-pressed={draft.imageFit === "cover"} onClick={() => update({ ...draft, imageFit: "cover" })}>Fill</button>
                  <button type="button" aria-pressed={draft.imageFit === "contain"} onClick={() => update({ ...draft, imageFit: "contain" })}>Fit</button>
                </div>
              </label>
              <label style={fieldLabel}>Photo position
                <select aria-label="Photo position" value={draft.imageAnchor} onChange={(event) => update({ ...draft, imageAnchor: anchorValue(event.target.value) })}>
                  <option value="center">Center</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label style={fieldLabel}>{proportionLabel(template)} {Math.round(draft.split * 100)}%
                <input type="range" min={spec.min} max={spec.max} step={0.01} value={draft.split} aria-describedby="proportion-note"
                  onChange={(event) => update({ ...draft, split: Number(event.target.value) })} />
              </label>
              <p id="proportion-note" style={{ fontSize: 13, color: "#5c534c", marginTop: 0 }}>{proportionNote(template)}</p>
              {template === "triple-column" || template === "two-menu-promo" ? <ColumnWidths draft={draft} update={update} /> : null}
            </details>
          </div>

          <div className={step === "publish" ? "studio-pane on" : "studio-pane"} data-step="publish">
            {account?.legacy.length ? <p style={{ fontSize: 13, color: "#5c534c" }}>Classic menus stay in the menu editor: {account.legacy.map((item) => item.name).join(", ")}.</p> : null}
            {accountMode ? null : (
              <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0", minHeight: 44 }}>
                <input type="checkbox" checked={videoOn && !!videoBox && !draft.videoMediaId} disabled={!videoBox || Boolean(draft.videoMediaId)} onChange={(event) => setVideoOn(event.target.checked)} />
                Play the bundled demo in the safe area
              </label>
            )}
            <div className="studio-save-inline" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {accountMode ? <a href="/dashboard/media/menus" className="btn btn-quiet min-h-11" style={{ textDecoration: "none" }} onClick={(event) => {
                event.preventDefault();
                requestLeave(() => { if (onClose) onClose(); else window.location.assign("/dashboard/media/menus"); });
              }}>Menu boards</a> : null}
            </div>
            {note ? <p className="studio-inline-note" role="alert" style={{ fontSize: 14, color: "#5c534c" }}>{note}</p> : null}
          </div>
        </section>
        </div>

        <section className="studio-canvas" data-testid="studio-canvas" aria-label="Editing canvas">
          <p className="studio-kicker">Board</p>
          <div className="studio-canvas-stage">
            {renderStage(true)}
          </div>
        </section>

        <section className="studio-preview" aria-label="TV preview" id="studio-tv-preview" data-testid="studio-tv-preview">
          <div className="studio-preview-head">
            <p className="studio-kicker">Preview</p>
            <p className="studio-preview-note">Preview, not a live TV feed.</p>
          </div>
          <div className="studio-preview-live" data-canvas-mobile="true">{renderStage(true)}</div>
          <div className="studio-preview-still">{renderStage(false)}</div>
          {!accountMode && published ? <Stage svg={published.svg || layoutSvg(published.doc, { imageHref: published.imageHref })} video={published.videoOn ? published.videoBox || frameFor(published.doc.template, published.doc.split, published.doc.columnWidths).video : null} videoSrc={libraryVideoUrl(account, published.doc.videoMediaId, false)} label="Published preview" hits={[]} active="" onHit={() => undefined} /> : null}
          {!accountMode && !published ? <p className="studio-unpublished">No published preview yet.</p> : null}
        </section>
      </div>
      <div className="studio-savebar">
        {progress || note ? <p className="studio-status" role="status">{progress || note}</p> : null}
        <nav className="studio-tabs" role="tablist" aria-label="Editor steps">
          {(["preview", "template", "section", "content", "style", "publish"] as const).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={step === id} style={{ ...chip(step === id), flex: "1 1 0", padding: "6px 2px", fontSize: 12 }} onClick={() => {
              setStep(id);
              if (id === "preview") document.getElementById("studio-tv-preview")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }}>{stepLabel(id)}</button>
          ))}
        </nav>
        <div className="studio-save-actions">
          {renderSaveDraft()}
          {renderPublish()}
        </div>
      </div>
      <style>{`
        body:has(.studio-app) main.shell-main {
          max-width: none !important;
          width: auto;
          padding: 0.4rem 0.75rem 1rem !important;
        }
        body:has(.studio-app) nav[aria-label="Mobile"] { display: none !important; }
        body:has(.studio-app) .content-nav { margin-bottom: 0.5rem; }
        .studio-app { overflow-x: clip; }
        .studio-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; position: sticky; top: 0; z-index: 30; background: #f4f7fb; border-bottom: 1px solid #e2e7ef; padding: 4px 4px 4px 0; }
        .studio-toolbar-lead { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; min-width: 0; flex: 1 1 240px; }
        .studio-toolbar-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-left: auto; }
        .studio-toolbar-note { flex: 1 1 100%; margin: 0; font-size: 13px; color: #5c6474; }
        .studio-back { border: 0; background: transparent; color: #0066ff; font: inherit; font-size: 13px; font-weight: 650; min-height: 44px; padding: 0 2px; cursor: pointer; }
        .studio-back:hover { text-decoration: underline; text-underline-offset: 3px; }
        .studio-back:focus-visible { outline: 3px solid #0066ff; outline-offset: 2px; border-radius: 6px; }
        .studio-page-title { min-width: 0; }
        .studio-title { font-size: 1.15rem; line-height: 1.25; margin: 0; display: flex; align-items: center; gap: 8px; min-width: 0; font-weight: 700; }
        .studio-title-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .studio-title-input { font: inherit; font-size: 1.15rem; font-weight: 700; border: 1px solid #0066ff; border-radius: 8px; padding: 6px 10px; min-height: 44px; min-width: 12rem; max-width: 24rem; background: #fff; }
        .studio-rename { border: 0; background: transparent; color: #5c6474; font: inherit; font-size: 12px; font-weight: 650; min-height: 44px; min-width: 44px; padding: 0 8px; cursor: pointer; border-radius: 8px; }
        .studio-rename:hover { background: #e8edf4; color: #0b1220; }
        .studio-rename:focus-visible { outline: 3px solid #0066ff; outline-offset: 2px; }
        .studio-lead { display: none; }
        .board-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; }
        .board-switch { appearance: none; -webkit-appearance: none; font: inherit; font-size: 13px; font-weight: 600; color: #0b1220; background-color: #fff; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath fill='%235c6474' d='M4.2 6.2a.75.75 0 0 1 1.06 0L8 8.94l2.74-2.74a.75.75 0 0 1 1.06 1.06l-3.27 3.27a.75.75 0 0 1-1.06 0L4.2 7.26a.75.75 0 0 1 0-1.06z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; border: 1px solid #d0d7e2; border-radius: 10px; padding: 8px 34px 8px 12px; min-height: 40px; min-width: 11rem; max-width: 18rem; cursor: pointer; }
        .board-switch:hover { border-color: #b5becc; }
        .board-switch:focus-visible { outline: 3px solid #0066ff; outline-offset: 2px; }
        .board-new { min-height: 40px; }
        .studio-grid { max-width: none; width: 100%; margin: 0; padding: 12px 4px 28px; display: grid; gap: 20px; grid-template-columns: 320px minmax(0, 1fr); grid-template-areas: "controls canvas"; align-items: start; }
        .studio-left { grid-area: controls; display: flex; flex-direction: column; gap: 12px; min-width: 0; max-height: calc(100dvh - 8.5rem); overflow-y: auto; position: sticky; top: 4.25rem; padding-right: 2px; }
        .studio-heading { grid-area: head; }
        .studio-controls { min-width: 0; display: flex; flex-direction: column; gap: 12px; }
        .studio-canvas { grid-area: canvas; display: none; min-width: 0; position: sticky; top: 4.25rem; }
        .studio-canvas-stage { background: #e7edf5; border-radius: 16px; padding: 12px; display: flex; align-items: flex-start; justify-content: center; }
        .studio-canvas .preview-frame { width: 100%; box-shadow: 0 10px 36px rgba(11,18,32,.16); border-radius: 12px; }
        .studio-preview { grid-area: preview; display: flex; flex-direction: column; gap: 8px; min-width: 0; position: sticky; top: 4.25rem; align-self: start; }
        .studio-preview .preview-frame { width: 100%; border-radius: 12px; box-shadow: 0 6px 20px rgba(11,18,32,.1); }
        .studio-preview-head { display: grid; gap: 2px; }
        .studio-preview-note { margin: 0; font-size: 12px; line-height: 1.4; color: #5c6474; }
        .studio-preview-live { display: none; }
        .studio-preview-still { display: block; }
        .studio-selected-editor { background: #fff; border: 1px solid #e2e7ef; border-radius: 16px; padding: 16px; min-width: 0; }
        .studio-zone-hint { margin: 0; font-size: 14px; line-height: 1.45; color: #5c6474; }
        .zone-hit:focus-visible { outline: 3px solid #ffd34d; outline-offset: 2px; z-index: 2; }
        .studio-kicker { margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; text-transform: none; color: #5c6474; }
        .studio-sheet-note { display: none; margin: 0 0 8px; font-size: 14px; color: #5c6474; }
        .studio-tabs { display: none; }
        .studio-savebar { display: none; }
        .zone-panel { display: none; }
        .zone-panel.on { display: block; }
        .file-btn { position: relative; overflow: hidden; }
        .file-btn input { position: absolute; inset: 0; opacity: 0; width: 100%; cursor: pointer; }
        .zone-groups, .zone-stack { display: grid; gap: 12px; }
        .zone-group { display: grid; gap: 8px; padding: 12px; background: #fff; border: 1px solid #e2e7ef; border-radius: 16px; }
        .zone-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .zone-head h2 { margin: 0; font-size: 18px; line-height: 1.2; }
        .zone-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
        .chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .media-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .media-row.single { grid-template-columns: 1fr; }
        .media-row .btn { width: 100%; height: 44px; min-height: 44px; white-space: nowrap; }
        .library-btn { width: 100%; height: 44px; min-height: 44px; }
        .preview-frame { margin: 0; background: #111; border-radius: 12px; overflow: hidden; width: 100%; }
        .remove-btn { border: 0; background: transparent; color: #b8342a; font: inherit; font-size: 14px; font-weight: 650; min-height: 44px; padding: 0 4px; cursor: pointer; }
        .action-stack { display: grid; gap: 4px; flex: 1 1 140px; align-content: start; min-width: 0; }
        .action-stack .btn { width: 100%; flex: none; }
        .zone-group h3, .zone-picker h3, .section-card-legend { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: 0; text-transform: none; color: #0b1220; }
        .zone-help { margin: 8px 0 0; font-size: 13px; line-height: 1.4; color: #5c6474; }
        .media-card { display: flex; gap: 12px; align-items: center; min-width: 0; }
        .media-meta { min-width: 0; flex: 1; }
        .media-thumb { width: 112px; height: 63px; border-radius: 8px; object-fit: cover; background: #111; flex: 0 0 auto; }
        .media-name { margin: 0; font-size: 14px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .media-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .segment { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 999px; background: #e8edf4; margin: 8px 0; }
        .segment:has(button:nth-child(3)) { grid-template-columns: 1fr 1fr 1fr; }
        .segment:has(button:nth-child(n+4)) { grid-template-columns: 1fr 1fr; }
        .segment button { min-height: 44px; border: 0; border-radius: 999px; background: transparent; font: inherit; font-size: 13px; font-weight: 650; color: #0b1220; cursor: pointer; text-transform: none; }
        .segment button[aria-pressed="true"] { background: #fff; color: #0066ff; box-shadow: 0 1px 2px rgba(11,18,32,.12); }
        .segment button:hover { background: rgba(255,255,255,.7); }
        .segment button[aria-pressed="true"]:hover { background: #fff; }
        .segment button:focus-visible { outline: 3px solid #0066ff; outline-offset: 2px; }
        .media-actions .btn { min-height: 44px; border-radius: 12px; flex: 1 1 140px; }
        .studio-panel { background: #fff; border: 1px solid #e2e7ef; border-radius: 16px; padding: 2px 12px 12px; }
        .studio-panel + .studio-panel { margin-top: 0; }
        .studio-panel-summary { list-style: none; cursor: pointer; font-size: 13px; font-weight: 700; letter-spacing: 0; text-transform: none; color: #0b1220; min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .studio-panel-summary::-webkit-details-marker { display: none; }
        .studio-panel-summary::after { content: ""; width: 8px; height: 8px; border-right: 2px solid #8b94a5; border-bottom: 2px solid #8b94a5; transform: rotate(45deg); margin-right: 4px; transition: transform .15s ease; }
        details.studio-panel[open] > .studio-panel-summary::after { transform: rotate(-135deg); margin-top: 6px; }
        .studio-panel-summary:focus-visible { outline: 3px solid #0066ff; outline-offset: 2px; border-radius: 8px; }
        .template-thumbs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 8px 0 4px; }
        .template-thumb { display: grid; gap: 6px; padding: 5px; border: 1px solid #e2e7ef; border-radius: 12px; background: #fff; cursor: pointer; font: inherit; color: inherit; text-align: left; min-height: 44px; }
        .template-thumb:hover { border-color: #b5becc; }
        .template-thumb[aria-pressed="true"] { border-color: #0066ff; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #0066ff; }
        .template-thumb:focus-visible { outline: 3px solid #0066ff; outline-offset: 2px; }
        .template-thumb-frame { display: block; position: relative; aspect-ratio: 16 / 9; border-radius: 8px; overflow: hidden; background: #111; }
        .template-thumb-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .template-thumb-check { position: absolute; top: 5px; right: 5px; width: 18px; height: 18px; border-radius: 999px; background: #0066ff; color: #fff; font-size: 11px; font-weight: 800; line-height: 18px; text-align: center; box-shadow: 0 0 0 2px #fff; }
        .template-thumb-name { font-size: 11px; font-weight: 650; line-height: 1.3; color: #0b1220; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .section-card { background: #fff; border: 1px solid #e2e7ef; border-radius: 14px; margin: 10px 0; padding: 12px; min-width: 0; }
        .section-card-legend { padding: 0 4px; }
        .item-card { display: grid; grid-template-columns: minmax(0, 1fr) 4.25rem 2.75rem; gap: 6px 6px; align-items: start; padding: 8px 0; border-bottom: 1px solid #eef1f6; }
        .item-card:last-of-type { border-bottom: 0; }
        .item-card .item-name { grid-column: 1; width: 100%; min-width: 0; }
        .item-card .item-price { grid-column: 2; width: 100%; text-align: right; }
        .item-card .item-remove { grid-column: 3; width: 44px; height: 44px; min-height: 44px; border: 0; background: transparent; color: #8a3a32; font-size: 22px; line-height: 1; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
        .item-card .item-remove:hover { background: #fdecea; }
        .item-card .item-remove:focus-visible { outline: 3px solid #0066ff; outline-offset: 2px; }
        .item-card .item-desc { grid-column: 1 / 3; width: 100%; }
        .item-add { margin-top: 8px; width: 100%; min-height: 44px; }
        @media (max-width: 860px) {
          .studio-toolbar { position: static; padding: 8px 16px 4px; background: #f4f7fb; }
          .studio-toolbar-actions { display: none; }
          .studio-toolbar-note { display: none; }
          .board-bar { width: 100%; }
          .board-switch { min-width: 0; max-width: none; flex: 1 1 0; width: 0; }
          .board-new { flex: 0 0 auto; }
          .studio-title { font-size: 20px; line-height: 1.2; margin: 0; flex-wrap: wrap; }
          .studio-title-text { white-space: normal; }
          .studio-left { display: contents; max-height: none; overflow: visible; position: static; }
          .studio-grid { display: flex !important; flex-direction: column; align-items: stretch; overflow-x: clip; max-width: 100%; padding: 0 !important; gap: 0 !important; }
          .studio-controls { padding-bottom: calc(168px + env(safe-area-inset-bottom)); order: 3; }
          .studio-heading, .studio-controls, .studio-preview, .studio-editor-slot { width: 100%; max-width: 100%; min-width: 0; }
          .studio-controls { overflow-x: hidden; }
          .studio-canvas { display: none !important; }
          .studio-preview { position: static; z-index: 1; background: #f4f7fb; padding: 0 16px 12px; order: 1; }
          .studio-preview-live { display: block; }
          .studio-preview-still { display: none; }
          .studio-editor-slot { order: 2; padding: 0 16px 8px; }
          .studio-selected-editor { margin: 0; }
          .studio-preview .preview-frame { position: static; }
          .studio-unpublished { display: none; }
          .studio-inline-note { display: none; }
          .studio-savebar { display: flex; flex-direction: column; align-items: stretch; position: fixed; left: 0; right: 0; bottom: 0; z-index: 36; gap: 8px; padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); background: #fff; border-top: 1px solid #e2e7ef; }
          .studio-save-actions { display: flex; gap: 8px; }
          .studio-save-actions .btn { flex: 1 1 0; min-height: 44px; }
          .studio-status { margin: 0; font-size: 13px; line-height: 1.4; color: #0b1220; }
          .studio-save-inline { display: none !important; }
          .studio-tabs { display: flex; position: static; overflow-x: auto; background: transparent; border: 0; padding: 0; gap: 4px; }
          .studio-tabs button { flex: 0 0 auto; min-height: 44px; }
          .studio-pane, .section-block, .zone-panel { display: none; }
          .studio-pane.on { display: block; padding: 0 16px 16px; }
          .section-block.on, .zone-panel.on { display: block; }
          .template-thumbs { grid-template-columns: 1fr 1fr; }
          .studio-controls input, .studio-controls select, .studio-controls button, .studio-controls a { min-height: 44px; max-width: 100%; }
        }
        @media (min-width: 861px) {
          .studio-toolbar .studio-kicker { display: none; }
          .studio-save-inline { display: none !important; }
          .studio-tabs { display: none !important; }
          .studio-pane, .section-block { display: block; }
          .studio-pane[data-step="section"] .board-text { display: none; }
          .studio-pane[data-step="section"], .studio-pane[data-step="content"] { display: none; }
          .studio-mobile-hint { display: none; }
          .studio-canvas { display: flex; flex-direction: column; gap: 8px; }
          .studio-preview { position: sticky; align-self: start; }
          .studio-preview .preview-frame { position: static; }
        }
        @media (min-width: 1180px) {
          .studio-grid { grid-template-columns: 320px minmax(0, 1fr) 280px; grid-template-areas: "controls canvas preview"; }
          .studio-canvas { display: flex; flex-direction: column; gap: 8px; }
          .studio-preview { display: flex; }
        }
        @media (min-width: 861px) and (max-width: 1179px) {
          .studio-preview-still { display: none; }
          .studio-preview { display: none; }
          .studio-canvas { display: flex; flex-direction: column; gap: 8px; }
          .studio-canvas .studio-kicker::after { content: " · Preview, not a live TV feed"; font-weight: 500; letter-spacing: 0; text-transform: none; }
        }
        @media (min-width: 1680px) {
          .studio-grid { grid-template-columns: 360px minmax(0, 1fr) 320px; }
        }
        @font-face { font-family: Inter; src: url("/layout-studio/media/font/inter") format("truetype"); font-weight: 400; font-style: normal; }
        @font-face { font-family: Inter; src: url("/layout-studio/media/font/inter-bold") format("truetype"); font-weight: 700; font-style: normal; }
        @font-face { font-family: Inter; src: url("/layout-studio/media/font/inter-extrabold") format("truetype"); font-weight: 800; font-style: normal; }
        @font-face { font-family: "Noto Serif"; src: url("/layout-studio/media/font/noto-serif") format("truetype"); font-weight: 400; font-style: normal; }
        @font-face { font-family: "Noto Serif"; src: url("/layout-studio/media/font/noto-serif-bold") format("truetype"); font-weight: 700; font-style: normal; }
        figure svg { width: 100%; height: 100%; display: block; }
      `}</style>
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
  const hits = previewHits(template, frame);
  return (
    <div className="zone-picker">
      <div className="segment" role="group" aria-label="Sections">
        {hits.map((hit) => (
          <button key={hit.id} type="button" aria-pressed={hit.id === zone} onClick={() => onSelect(hit.id)}>
            {hit.label.replace(/^Edit /, "")}
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
}: {
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
  const panel = editorPanelForZone(zone);
  if (panel === "none") {
    return <p className="studio-zone-hint">Select an area in the preview to edit it here.</p>;
  }
  const columns = columnTemplate(template);
  const exclusive = zone === "feature" && template !== "signature";
  return (
    <div id="studio-selected-editor" className="studio-selected-editor" data-testid="studio-selected-editor" data-editor-panel={panel}>
      <ZoneHead zone={zone || "menu"} template={template} onClose={closeZone} />
      {panel === "menu" ? (
        <div className="zone-groups">
          <section className="zone-group">
            <h3>{columns ? "Menu column" : "Menu sections"}</h3>
            {columns ? null : (
              <div className="segment section-tabs" role="group" aria-label="Menu sections">
                {draft.sections.map((section, index) => (
                  <button key={index} type="button" aria-pressed={index === sectionIndex} onClick={() => setSectionIndex(index)}>
                    {section.name || `Section ${index + 1}`}
                  </button>
                ))}
              </div>
            )}
            {draft.sections.map((section, si) => {
              if (columns && si !== sectionIndex) return null;
              return (
                <fieldset key={si} className={si === sectionIndex ? "section-card section-block on" : "section-card section-block"}>
                  <legend className="section-card-legend">{columns ? `Menu column ${si + 1}` : `Section ${si + 1}`}</legend>
                  <input aria-label={`Section ${si + 1} name`} className="item-field" style={field} value={section.name} maxLength={MENU_LIMITS.sectionName}
                    onChange={(event) => update({ ...draft, sections: draft.sections.map((s, i) => i === si ? { ...s, name: event.target.value } : s) })} />
                  {section.items.map((item, ii) => (
                    <div key={ii} className="item-card">
                      <input aria-label={`Item ${ii + 1} in section ${si + 1}`} className="item-name" style={field} placeholder="Item name" value={item.name} maxLength={MENU_LIMITS.itemName}
                        onChange={(event) => setItem(draft, si, ii, { name: event.target.value }, update)} />
                      <input aria-label={`Price ${ii + 1} in section ${si + 1}`} className="item-price" style={field} placeholder="$0" value={item.price} maxLength={MENU_LIMITS.price}
                        onChange={(event) => setItem(draft, si, ii, { price: event.target.value }, update)} />
                      <button type="button" className="item-remove" aria-label={`Remove item ${ii + 1} in section ${si + 1}`}
                        onClick={() => update({ ...draft, sections: draft.sections.map((s, i) => i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s) })}>
                        <span aria-hidden="true">×</span>
                      </button>
                      <input aria-label={`Description ${ii + 1} in section ${si + 1}`} className="item-desc" style={field} placeholder="Description" value={item.description} maxLength={MENU_LIMITS.description}
                        onChange={(event) => setItem(draft, si, ii, { description: event.target.value }, update)} />
                    </div>
                  ))}
                  <button type="button" className="btn btn-quiet item-add" onClick={() => update({ ...draft, sections: draft.sections.map((s, i) => i === si ? { ...s, items: [...s.items, blankItem()] } : s) })}>Add item</button>
                  {template === "triple-column" && si === draft.sections.length - 1 ? (
                    <p className="zone-help">A photo sits behind all three columns. A video is not added, because it would cover a column.</p>
                  ) : null}
                </fieldset>
              );
            })}
            {columns ? null : (
              <button type="button" className="btn btn-quiet item-add" onClick={() => update({ ...draft, sections: [...draft.sections, { name: "Section", items: [blankItem()] }] })}>Add section</button>
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
            imageLimitLabel={isolatedPhotoLimit ? ISOLATED_STUDIO_PHOTO_LIMIT_LABEL : undefined}
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
              setNote(exclusive && entry && (draft.videoMediaId || clipUrl) ? "Image replaces the video in this zone." : "");
            }}
            onLibraryVideo={(entry) => {
              if (panel === "background") return;
              const applied = applyLibraryFile(draft, entry, "video");
              const next = placeZoneMedia(applied, "video", applied.videoMediaId, exclusive && Boolean(entry));
              update(next);
              setClipUrl(null);
              setVideoOn(Boolean(next.videoMediaId));
              if (exclusive && entry) setImageHref(null);
              setNote(exclusive && entry && (draft.imageMediaId || imageHref) ? "Video replaces the image in this zone." : "");
            }}
          />
          {panel === "media" && zoneAllows(template, zone, "text") ? (
            <section className="zone-group">
              <h3>Text settings</h3>
              <label style={fieldLabel}>{template === "split-50" ? "Right side title" : template === "signature" ? "Side title" : "Feature title"}
                <input aria-label={template === "split-50" ? "Right side title" : "Feature title"} style={field} value={draft.featureTitle} maxLength={40}
                  onChange={(event) => update({ ...draft, featureTitle: event.target.value })} />
              </label>
              <label style={fieldLabel}>{template === "split-50" ? "Right side detail" : template === "signature" ? "Side detail" : "Feature detail"}
                <input aria-label={template === "split-50" ? "Right side detail" : "Feature detail"} style={field} value={draft.featureDetail} maxLength={80}
                  onChange={(event) => update({ ...draft, featureDetail: event.target.value })} />
              </label>
            </section>
          ) : null}
          {panel === "background" ? (
            <ColorField label="Menu background" ariaLabel="Menu background" value={draft.backgroundColor} fallback="#f6f9fe" onChange={(next) => update({ ...draft, backgroundColor: next })} />
          ) : null}
          {template === "triple-column" && zone === "photo" ? (
            <FileUploadControl kind="image" accept="image/jpeg,image/png,image/webp" limitLabel={isolatedPhotoLimit ? ISOLATED_STUDIO_PHOTO_LIMIT_LABEL : undefined} onFiles={(files) => onPhoto(files[0])} />
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
            aria-label={hit.label}
            aria-pressed={active === hit.id}
            onClick={() => onHit(hit.id)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onHit(hit.id); } }}
            style={{
              position: "absolute",
              left: frame.left + hit.box.x * frame.scale,
              top: frame.top + hit.box.y * frame.scale,
              width: Math.max(44, hit.box.w * frame.scale),
              height: Math.max(44, hit.box.h * frame.scale),
              background: active === hit.id ? "rgba(255, 211, 77, 0.28)" : "transparent",
              border: active === hit.id ? "3px solid #ffd34d" : "2px solid rgba(255,255,255,0.92)",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.55)",
              cursor: "pointer", padding: 0, color: "#fff",
            }}
          >
            <span style={{ position: "absolute", left: 4, top: hit.id === "menu" || hit.id.startsWith("column-") ? undefined : 4, bottom: hit.id === "menu" || hit.id.startsWith("column-") ? 4 : undefined, maxWidth: "calc(100% - 8px)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: active === hit.id ? "#0066ff" : "rgba(0,0,0,0.45)", borderRadius: 6, padding: "2px 6px", fontSize: 11, fontWeight: 700, lineHeight: "14px" }}>{hit.label.replace(/^Edit /, "")}</span>
          </button>
        ))}
      </div>
    </figure>
  );
}


function BoardText({ draft, update }: { draft: LayoutDocument; update: (next: LayoutDocument) => void }) {
  return (
    <section className="zone-group board-text">
      <h3>Text settings</h3>
      <label style={fieldLabel}>Title
        <input style={field} aria-label="Title" value={draft.title} maxLength={MENU_LIMITS.title} onChange={(event) => update({ ...draft, title: event.target.value })} />
      </label>
      <label style={fieldLabel}>Subtitle
        <input style={field} aria-label="Subtitle" value={draft.subtitle} maxLength={MENU_LIMITS.subtitle} onChange={(event) => update({ ...draft, subtitle: event.target.value })} />
      </label>
      <label style={fieldLabel}>Footer
        <input style={field} aria-label="Footer" value={draft.footer} maxLength={MENU_LIMITS.footer} onChange={(event) => update({ ...draft, footer: event.target.value })} />
      </label>
    </section>
  );
}

function ZoneHead({ zone, template, onClose }: { zone: string; template: LayoutTemplate; onClose: () => void }) {
  const caps = zoneCapabilities(template).find((item) => item.id === zone);
  return (
    <header className="zone-head">
      <div>
        <h2>{zoneLabel(zone, template)}</h2>
        <div className="zone-chips">
          {caps?.text ? <span className="badge">Text</span> : null}
          {caps?.image ? <span className="badge">Image</span> : null}
          {caps?.video ? <span className="badge">Video</span> : null}
        </div>
      </div>
      <button type="button" className="btn btn-quiet" onClick={onClose} aria-label="Close section">Close</button>
    </header>
  );
}

function enlargePreviewText(svg: string) {
  return svg.replace(/font-size="([\d.]+)"/g, (_match, size) => `font-size="${Math.round(Number(size) * 1.12)}"`);
}

function boardChoice(board: AccountBoard) {
  const layout = templateSpec(board.document.template).name;
  const when = board.updatedAt ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(board.updatedAt)) : "";
  return [board.name, layout, when].filter(Boolean).join(" · ");
}

function zoneLabel(zone: string, template: LayoutTemplate) {
  return zoneCapabilities(template).find((item) => item.id === zone)?.label ?? "Section";
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
  const [libraryOpen, setLibraryOpen] = useState(false);
  const hasImage = allowImage && Boolean(draft.imageMediaId || previewImage);
  const hasVideo = allowVideo && Boolean(draft.videoMediaId || previewVideo || videoAttached);
  const imageLabel = hasImage && !hasVideo ? "Replace image" : "Upload image";
  const videoLabel = hasVideo ? "Replace video" : "Upload video";
  const imagePrimary = allowImage && !hasVideo;
  const videoPrimary = allowVideo && (hasVideo || !allowImage);
  const imageFile = account?.library.find((item) => item.id === draft.imageMediaId);
  const videoFile = account?.library.find((item) => item.id === draft.videoMediaId);
  const thumbVideo = previewVideo || videoFile?.url || "";
  const thumbImage = previewImage || imageFile?.url || "";
  return (
    <div className="zone-groups">
      <section className="zone-group">
        <h3>Media</h3>
        <p className="zone-help">{photoLabel}. {allowImage && allowVideo ? (promoArea ? PROMO_AREA_HINT : "Image or one video.") : allowVideo ? "One video." : "Image only."}</p>
        {hasVideo && allowVideo ? (
          <div className="media-card">
            {thumbVideo ? <video className="media-thumb" muted playsInline preload="auto" src={thumbVideo.includes("#") || thumbVideo.startsWith("blob:") ? thumbVideo : `${thumbVideo}#t=0.1`} onLoadedData={(event) => { const node = event.currentTarget; if (node.currentTime < 0.05) node.currentTime = 0.1; }} /> : <div className="media-thumb" />}
            <div className="media-meta">
              <p className="media-name">{videoFile?.name || "Video"}</p>
              <p className="zone-help">Video</p>
            </div>
            <button type="button" className="remove-btn" onClick={removeVideo}>Remove video</button>
          </div>
        ) : hasImage ? (
          <div className="media-card">
            {thumbImage ? <img className="media-thumb" alt="" src={thumbImage} /> : <div className="media-thumb" />}
            <div className="media-meta">
              <p className="media-name">{imageFile?.name || "Image"}</p>
              <p className="zone-help">Image</p>
            </div>
            <button type="button" className="remove-btn" onClick={removePhoto}>Remove image</button>
          </div>
        ) : <p className="zone-help">Nothing in this zone yet.</p>}
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
        {hasVideo && allowImage ? <p className="zone-help">Replaces the current video.</p> : null}
        {hasImage && !hasVideo && allowVideo ? <p className="zone-help">Replaces the current image.</p> : null}
        {account ? <button type="button" className="btn btn-quiet library-btn" aria-expanded={libraryOpen} onClick={() => setLibraryOpen((open) => !open)}>Choose from library</button> : null}
        {libraryOpen && account ? (
          <div className="media-actions">
            {allowImage ? <label className="zone-help">Image
              <select className="field" aria-label="Choose image from library" value={hasVideo && allowVideo ? "" : (draft.imageMediaId ?? "")} onChange={(event) => onLibraryPhoto(account.library.find((item) => item.id === event.target.value) ?? null)}>
                <option value="">No photo</option>
                {account.library.filter((item) => item.kind === "image").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label> : null}
            {allowVideo ? (
              <label className="zone-help">Video
                <select className="field" aria-label="Choose video from library" value={draft.videoMediaId ?? ""} onChange={(event) => onLibraryVideo(account.library.find((item) => item.id === event.target.value) ?? null)}>
                  <option value="">No video</option>
                  {account.library.filter((item) => item.kind === "video").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
        {allowVideo ? <p className="zone-help">{hasVideo ? "This board already has its one video. Another video replaces it." : "A board plays one video, muted and looping, in this zone."}</p> : null}
      </section>
      <section className="zone-group">
        <h3>Display settings</h3>
        <div className="segment" role="group" aria-label="How the media fits">
          <button type="button" aria-pressed={draft.imageFit !== "contain"} onClick={() => update({ ...draft, imageFit: "cover" })}>Fill</button>
          <button type="button" aria-pressed={draft.imageFit === "contain"} onClick={() => update({ ...draft, imageFit: "contain" })}>Fit</button>
        </div>
        <p className="zone-help">Fill: covers the section and may crop the edges. Fit: shows the whole image or video and may leave bars.</p>
        <label className="zone-help">Position
          <select className="field" aria-label="Photo position" value={draft.imageAnchor} onChange={(event) => update({ ...draft, imageAnchor: anchorValue(event.target.value) })}>
            <option value="center">Center</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
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

function stepLabel(step: StudioStep) {
  if (step === "template") return "Template";
  if (step === "section") return "Section";
  if (step === "content") return "Content";
  if (step === "style") return "Style";
  if (step === "preview") return "Preview";
  return "Publish";
}

function anchorValue(value: string): LayoutDocument["imageAnchor"] {
  if (value === "top" || value === "bottom" || value === "left" || value === "right") return value;
  return "center";
}

function ColumnWidths({ draft, update }: { draft: LayoutDocument; update: (next: LayoutDocument) => void }) {
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
      <legend>Column widths</legend>
      {widths.map((width, index) => (
        <label key={index} style={fieldLabel}>Column {index + 1} {Math.round(width * 100)}%
          <input aria-label={`Column ${index + 1} width`} type="range" min={0.2} max={0.6} step={0.01} value={width} onChange={(event) => setWidth(index, Number(event.target.value))} />
        </label>
      ))}
      <p style={{ fontSize: 13, color: "#5c534c" }}>Each column is 20% to 60%. They always add up to the full board.</p>
    </fieldset>
  );
}

function proportionLabel(template: LayoutTemplate) {
  if (template === "menu-banner") return "Banner height";
  if (template === "triple-column") return "First column width";
  if (template === "two-menu-promo") return "First menu column";
  if (template === "two-column") return "First column width";
  if (template === "signature") return "Menu card width";
  if (template === "split-50") return "Left side";
  return "Menu width";
}

function proportionNote(template: LayoutTemplate) {
  if (template === "triple-column") return "Each column is 20% to 60% and the three widths add up to the full board. This layout has no video area.";
  if (template === "two-menu-promo") return "The two menu columns and the promotion add up to the full 16:9 board, about 35% / 35% / 30%. Both menus are edited separately. The promo area uses a photo or video from Media.";
  if (template === "two-column") return "The two menu columns add up to the full 16:9 board, about 50% / 50%. Each column is edited separately. A photo can sit behind both. A video is not added, because it would cover a column.";
  if (template === "menu-banner") return "Banner height is 12% to 28% of the board. The menu uses the space above it.";
  if (template === "menu-promo-67") return "Menu width is 55% to 75%. The promo area uses a photo or video from Media for the rest.";
  if (template === "split-50") return "The left side is 40% to 60%. The right side uses the rest.";
  return "The menu card is 40% to 70% of the width. The video stays in the strip beside it.";
}

function chip(active: boolean): CSSProperties {
  return {
    border: active ? "2px solid #1a1614" : "1px solid #ddd4c6",
    background: "#fff",
    borderRadius: 999,
    padding: "8px 12px",
    cursor: "pointer",
    color: "#1a1614",
  };
}

const field: CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #ddd4c6", borderRadius: 8, padding: "8px 10px", font: "inherit" };
const fieldLabel: CSSProperties = { display: "grid", gap: 4, margin: "10px 0", fontSize: 14 };
