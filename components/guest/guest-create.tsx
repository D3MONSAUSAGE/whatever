"use client";
/**
 * /create: the real Pekko menu designer for visitors without an account (docs/GUEST_EDITOR_PLAN.md).
 *
 * The menu and its photos live in this browser (lib/guest-draft.ts) and are saved as the visitor works, so a refresh,
 * the back button, an interrupted sign-up or coming back later never loses them. Account actions (save, show on TV,
 * share, download) open the sign-up sheet; the draft is only removed after the account confirms it has the menu.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoardView, DesignGallery, TemplateEditor, type GuestEditorHooks, type Step } from "@/components/menu-templates";
import { ToastProvider } from "@/components/toast";
import { Dialog } from "@/components/dialog";
import { useLocale } from "@/lib/i18n/client";
import type { LayoutDocument } from "@/lib/layout-studio";
import type { AccountLibraryFile } from "@/lib/layout-account";
import { engineOf } from "@/lib/menu-designer";
import { designById, designDocument } from "@/lib/menu-designs";
import { asUploadImage } from "@/lib/prepare-image";
import {
  GUEST_MAX_IMAGES, GuestImageError, addGuestImage, guestStore, listGuestImages, loadGuestDraft, pruneGuestImages, saveGuestDraft, startGuestDraft,
  type GuestAction, type GuestDraft, type GuestImage, type GuestSource,
} from "@/lib/guest-draft";
import { conversion } from "@/lib/conversion-events";
import { GuestAuthSheet, claimPath } from "@/components/guest/guest-auth-sheet";
import { browserSignedIn } from "@/lib/funnel-client";

type Phase = "loading" | "resume" | "gallery" | "editor";

export function GuestCreate({ design: designParam, from: fromParam }: { design: string | null; from: string | null }) {
  return (
    <ToastProvider>
      <GuestCreateInner designParam={designParam} fromParam={fromParam} />
    </ToastProvider>
  );
}

function GuestCreateInner({ designParam, fromParam }: { designParam: string | null; fromParam: string | null }) {
  const { locale, t } = useLocale();
  const L = locale === "es" ? "es" : "en";
  const [phase, setPhase] = useState<Phase>("loading");
  const [draft, setDraft] = useState<GuestDraft | null>(null);
  const [images, setImages] = useState<GuestImage[]>([]);
  const [persistent, setPersistent] = useState(true);
  const [sheet, setSheet] = useState<GuestAction | null>(null);
  const [done, setDone] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [initialStep, setInitialStep] = useState<Step>(0);
  const latest = useRef<{ doc: LayoutDocument; name: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialJson = useRef<string | null>(null);
  // The draft as last saved; updated directly (no side effects inside state updaters).
  const draftRef = useRef<GuestDraft | null>(null);
  const commit = useCallback((next: GuestDraft, delay = 0) => {
    draftRef.current = next;
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (delay) saveTimer.current = setTimeout(() => { saveTimer.current = null; void saveGuestDraft(next); }, delay);
    else void saveGuestDraft(next);
  }, []);
  const pendingDesign = useRef<string | null>(null);

  // ---- open: resume, start from a design, or show the gallery
  useEffect(() => {
    let live = true;
    void (async () => {
      const store = await guestStore();
      if (!live) return;
      setPersistent(store.persistent);
      const existing = await loadGuestDraft();
      const fromDemo = fromParam === "demo";
      const wanted = designParam && designById(designParam) ? designParam : null;
      if (existing && fromDemo) {
        // The homepage demo has just written this draft: open it on the Menu step.
        open(existing, 1, "demo");
      } else if (existing && wanted) {
        pendingDesign.current = wanted;
        draftRef.current = existing;
        setDraft(existing);
        setPhase("resume");
      } else if (existing) {
        open(existing, 0, "resume");
      } else if (wanted) {
        const design = designById(wanted)!;
        const d = await startGuestDraft(designDocument(design), design.name[L], "cta");
        if (!live) return;
        conversion("guest_template_selected", { design: design.id });
        open(d, 0, "cta");
      } else {
        conversion("guest_editor_opened", { detail: fromParam === "cta" ? "cta" : "direct" }, { oncePerPage: true });
        setPhase("gallery");
      }
      setImages(await listGuestImages());
    })();
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function open(d: GuestDraft, step: Step, source: GuestSource) {
    latest.current = { doc: d.document, name: d.name };
    draftRef.current = d;
    // The editor reports its opening state once; that first report is not an edit.
    initialJson.current = null;
    setDraft(d);
    setInitialStep(step);
    setEditorKey((k) => k + 1);
    setPhase("editor");
    // A refresh (or coming back) should resume this menu, not start the design or demo hand-off again.
    if (location.search) history.replaceState(history.state, "", location.pathname);
    conversion("guest_editor_opened", { detail: source }, { oncePerPage: true });
    // A sign-up that was interrupted (closed sheet, refresh) comes back to the same choice.
    if (d.intent) setSheet(d.intent);
  }

  // ---- library: the photos kept in this browser, as blob: URLs the real editor and renderer can draw
  const urls = useRef(new Map<string, string>());
  const library: AccountLibraryFile[] = useMemo(() => images.map((img) => {
    let url = urls.current.get(img.id);
    if (!url) { url = URL.createObjectURL(img.blob); urls.current.set(img.id, url); }
    return { id: img.id, name: img.name, kind: "image" as const, mime: img.type, url, sizeBytes: img.size };
  }), [images]);
  useEffect(() => () => { for (const u of urls.current.values()) URL.revokeObjectURL(u); }, []);

  // ---- saving as the visitor works (debounced)
  const onChange = useCallback((doc: LayoutDocument, name: string) => {
    latest.current = { doc, name };
    const json = JSON.stringify(doc) + "\u0000" + name;
    if (initialJson.current === null) { initialJson.current = json; return; }
    if (json === initialJson.current) return;
    const d = draftRef.current;
    if (!d) return;
    const next: GuestDraft = { ...d, document: doc, name };
    if (!d.edited) { next.edited = true; conversion("guest_customization_started", { design: doc.design ?? doc.template ?? "" }); }
    commit(next, 400);
  }, [commit]);
  // Save at once when the page is hidden (tab switch, app switch, navigation): nothing waits on the debounce.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== "hidden" || !saveTimer.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (draftRef.current) void saveGuestDraft(draftRef.current);
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", flush); window.removeEventListener("pagehide", flush); };
  }, []);

  const upload = useCallback(async (file: File) => {
    try {
      const ready = await asUploadImage(file, t);
      const meta = await addGuestImage(ready);
      setImages(await listGuestImages());
      return meta.id;
    } catch (err) {
      if (err instanceof GuestImageError) throw new Error(t(`guest.img.${err.code}`, { n: GUEST_MAX_IMAGES }));
      throw err;
    }
  }, [t]);
  // Drop photos that are no longer used anywhere (keeps the last few for re-use).
  useEffect(() => {
    if (!draft) return;
    const id = setTimeout(() => { void pruneGuestImages(draft.document).then(listGuestImages).then(setImages); }, 2000);
    return () => clearTimeout(id);
  }, [draft?.document]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- account actions
  function ask(action: GuestAction) {
    conversion("guest_action_clicked", { detail: action });
    if (draftRef.current) commit({ ...draftRef.current, intent: action });
    // Already signed in on this browser: no sheet, straight to saving it in the account.
    if (browserSignedIn()) { if (saveTimer.current) clearTimeout(saveTimer.current); void saveGuestDraft({ ...draftRef.current!, intent: action }).then(() => location.assign(claimPath(action))); return; }
    setSheet(action);
  }
  function closeSheet() {
    setSheet(null);
    if (draftRef.current) commit({ ...draftRef.current, intent: null });
  }
  function preview() {
    conversion("guest_menu_previewed", {}, { oncePerPage: true });
    setDone(true);
  }

  const hooks: GuestEditorHooks = useMemo(() => ({
    library,
    upload,
    onChange,
    onSave: () => ask("save"),
    status: persistent ? t("guest.statusSaved") : t("guest.statusMemory"),
    backLabel: t("guest.backToDesigns"),
    actions: (
      <>
        <button type="button" className="btn btn-quiet" onClick={preview} data-testid="guest-preview">{t("guest.preview")}</button>
        <button type="button" className="btn btn-quiet" onClick={() => ask("save")} data-testid="guest-save">{t("guest.save")}</button>
        <button type="button" className="btn btn-primary" onClick={() => ask("display")} data-testid="guest-display">{t("guest.display")}</button>
      </>
    ),
  }), [library, upload, onChange, persistent, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- finished preview art (same as the editor's)
  const urlFor = (id: string | null | undefined) => (id ? library.find((f) => f.id === id)?.url ?? null : null);
  const current = latest.current;
  const art = current ? {
    imageHref: urlFor(current.doc.imageMediaId),
    logoHref: urlFor(current.doc.logoMediaId),
    itemImages: Object.fromEntries(library.filter((f) => f.url).map((f) => [f.id, f.url as string])),
  } : null;

  if (phase === "loading") {
    return <p className="p-6 text-muted" role="status" data-testid="guest-loading">{t("guest.loading")}</p>;
  }

  if (phase === "resume" && draft) {
    return (
      <div className="mx-auto max-w-lg p-6 grid gap-4" data-testid="guest-resume">
        <h1 className="font-display text-2xl font-bold">{t("guest.resumeTitle")}</h1>
        <p>{t("guest.resumeBody", { name: draft.name || t("tpl.untitled") })}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" data-testid="guest-resume-continue" onClick={() => open(draft, 0, "resume")}>{t("guest.resumeContinue")}</button>
          <button type="button" className="btn btn-quiet" data-testid="guest-resume-new" onClick={async () => {
            const design = designById(pendingDesign.current ?? "") ?? null;
            if (!design) { setPhase("gallery"); return; }
            const d = await startGuestDraft(designDocument(design), design.name[L], "cta");
            setImages([]);
            conversion("guest_template_selected", { design: design.id });
            open(d, 0, "cta");
          }}>{t("guest.resumeNew")}</button>
        </div>
        <p className="text-sm text-muted">{t("guest.resumeNewNote")}</p>
      </div>
    );
  }

  if (phase === "gallery" || !draft) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6" data-testid="guest-gallery">
        <DesignGallery brand={null} includeClassic={false} title={t("guest.galleryTitle")} lede={t("guest.galleryLede")} cancelLabel={t("guest.galleryBack")}
          onCancel={() => { location.assign(locale === "es" ? "/es" : "/"); }}
          onPick={async ({ document, name }) => {
            const d = await startGuestDraft(document, name, "cta");
            setImages([]);
            conversion("guest_template_selected", { design: document.design ?? document.template ?? "" });
            open(d, 0, "cta");
          }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] p-3 md:p-6" data-testid="guest-editor">
      {!persistent ? <p className="note-warn text-sm mb-3" role="status" data-testid="guest-memory-note">{t("guest.memoryNote")}</p> : null}
      <TemplateEditor key={editorKey} menuId={null} name={draft.name} document={draft.document} displays={null} brand={null} unified
        initialStep={initialStep} guest={hooks}
        onClose={() => setPhase("gallery")} onAdvanced={() => undefined} />
      {done && current && art ? (
        <Dialog label={t("guest.done.title")} onClose={() => setDone(false)} variant="center" className="bg-paper w-full max-w-4xl rounded-2xl p-5 max-h-[92dvh] overflow-y-auto" testId="guest-done">
          <div className="grid gap-4">
            <div className="flex items-center gap-3">
              <PeekHappy />
              <div>
                <h2 className="font-display text-2xl font-bold">{t("guest.done.title")}</h2>
                <p className="text-muted text-sm">{t("guest.done.body")}</p>
              </div>
            </div>
            <div className="rounded-xl bg-[#1d1630] p-2 md:p-3 shadow-lg">
              <BoardView engine={engineOf(current.doc, null)} doc={current.doc} classic={null} art={art} brand={null} className="tpl-tv" label={t("tpl.previewAria", { name: current.name })} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" className="btn btn-primary" data-testid="guest-done-display" onClick={() => { setDone(false); ask("display"); }}>{t("guest.display")}</button>
              <button type="button" className="btn btn-quiet" data-testid="guest-done-save" onClick={() => { setDone(false); ask("save"); }}>{t("guest.save")}</button>
              <button type="button" className="btn btn-quiet" data-testid="guest-done-share" onClick={() => { setDone(false); ask("share"); }}>{t("guest.share")}</button>
              <button type="button" className="btn btn-quiet" data-testid="guest-done-download" onClick={() => { setDone(false); ask("download"); }}>{t("guest.download")}</button>
            </div>
            <button type="button" className="btn btn-quiet justify-self-center" data-testid="guest-done-close" onClick={() => setDone(false)}>{t("guest.done.keepEditing")}</button>
          </div>
        </Dialog>
      ) : null}
      {sheet && current && art ? (
        <GuestAuthSheet action={sheet} onClose={closeSheet}
          board={<BoardView engine={engineOf(current.doc, null)} doc={current.doc} classic={null} art={art} brand={null} className="tpl-tv" label={t("tpl.previewAria", { name: current.name })} />} />
      ) : null}
    </div>
  );
}

/** Peek, happy (decorative; same artwork as the brand character). */
function PeekHappy() {
  return (
    <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect x="6" y="14" width="52" height="40" rx="14" fill="#FFC53D" stroke="#251A3A" strokeWidth="1.5" />
      <rect x="25" y="55" width="14" height="5" rx="2.5" fill="#FFC53D" stroke="#251A3A" strokeWidth="1.2" />
      <path d="M19 37Q24 31 29 37M35 37Q40 31 45 37" stroke="#251A3A" strokeWidth="3.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}
