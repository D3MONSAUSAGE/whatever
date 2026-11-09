"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  accountSaveBody, applyLibraryFile, boardAfterReload, readAccountStudio,
  type AccountLibraryFile, type AccountStudio,
} from "@/lib/layout-account";
import {
  containedBoard, frameFor, layoutSvg, mediaVideoBox, MENU_LIMITS, parseLayout, sampleLayout, templateSpec,
  type LayoutDocument, type LayoutItem, type LayoutTemplate,
} from "@/lib/layout-studio";
import { api, authToken, uploadForm } from "@/lib/api";
import { blobToBase64, prepareVideo, uploadToSignedUrl } from "@/lib/prepare-video";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";

const TEMPLATES: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature"];
const DRAFT_KEY = "layout-studio-draft-v1";
const PUBLISHED_KEY = "layout-studio-published-v1";

type StudioStep = "template" | "section" | "content" | "style" | "publish";

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

export function LayoutStudio({ mode = "preview" }: { mode?: "preview" | "account" } = {}) {
  const accountMode = mode === "account";
  const [template, setTemplate] = useState<LayoutTemplate>("menu-promo-67");
  const [draft, setDraft] = useState<LayoutDocument>(() => sampleLayout("menu-promo-67"));
  const [imageHref, setImageHref] = useState<string | null>(null);
  const [videoOn, setVideoOn] = useState(true);
  const [published, setPublished] = useState<Snapshot | null>(null);
  const [account, setAccount] = useState<AccountStudio | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [note, setNote] = useState(accountMode ? "Loading this account." : "This browser copy does not write an account.");
  const spec = templateSpec(template);
  const frame = frameFor(draft.template, draft.split, draft.columnWidths);
  const [step, setStep] = useState<StudioStep>("template");
  const [zone, setZone] = useState("menu");
  const [sectionIndex, setSectionIndex] = useState(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const saveLock = useRef<"draft" | "publish" | null>(null);
  const svg = useMemo(() => layoutSvg(draft, { imageHref }), [draft, imageHref]);
  const videoBox = mediaVideoBox(draft);
  const librarySrc = libraryVideoUrl(account, draft.videoMediaId, !accountMode && videoOn && !draft.videoMediaId && !clipUrl);
  const zoneSrc = clipUrl || librarySrc || "/layout-studio/media/promo";
  const showZone = Boolean(videoBox) && (accountMode ? Boolean(clipUrl || (draft.videoMediaId && librarySrc)) : Boolean(clipUrl) || videoOn || Boolean(draft.videoMediaId));

  useEffect(() => {
    if (accountMode) return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Snapshot;
      const parsed = parseLayout(saved.doc);
      if (!parsed.ok) return;
      setTemplate(parsed.value.template);
      setDraft(parsed.value);
      setImageHref(typeof saved.imageHref === "string" ? saved.imageHref : null);
      setVideoOn(saved.videoOn === true && frameFor(parsed.value.template, parsed.value.split).video !== null);
      const publishedRaw = window.localStorage.getItem(PUBLISHED_KEY);
      if (publishedRaw) {
        const frozen = JSON.parse(publishedRaw) as Snapshot;
        const frozenDoc = parseLayout(frozen.doc);
        if (frozenDoc.ok) setPublished({ ...frozen, doc: frozenDoc.value });
      }
      setNote("Restored the draft stored in this browser.");
    } catch { /* a bad draft is ignored */ }
  }, [accountMode]);

  useEffect(() => {
    if (accountMode) {
      let cancel = false;
      api<unknown>("/api/layout-studio").then((body) => {
        if (cancel) return;
        const loaded = readAccountStudio(body);
        if (!loaded) { setNote("Couldn't read this account."); return; }
        setAccount(loaded);
        const board = boardAfterReload(loaded, null);
        if (board) {
          setMenuId(board.id);
          setTemplate(board.document.template);
          setDraft(board.document);
          setImageHref(loaded.library.find((file) => file.id === board.document.imageMediaId)?.url ?? null);
          setVideoOn(false);
        }
        setNote(loaded.boards.length ? "Loaded the board saved on this account." : "No layout board yet. Save a draft when this one is ready.");
      }).catch((err: Error) => { if (!cancel) setNote(err.message); });
      return () => { cancel = true; };
    }
    if (!supabaseConfigured()) return;
    let cancel = false;
    getSupabase().auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token || cancel) return;
      const res = await fetch("/api/layout-studio", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok || cancel) return;
      const loaded = readAccountStudio(await res.json().catch(() => null));
      if (!loaded || cancel) return;
      setSessionToken(token);
      setAccount(loaded);
      const board = boardAfterReload(loaded, null);
      if (board) {
        setMenuId(board.id);
        setTemplate(board.document.template);
        setDraft(board.document);
        setImageHref(loaded.library.find((file) => file.id === board.document.imageMediaId)?.url ?? null);
        setVideoOn(Boolean(board.document.videoMediaId) && frameFor(board.document.template, board.document.split).video !== null);
      }
      setNote(loaded.boards.length ? "Loaded the board saved on this account." : "Signed in. A draft will be stored on this account.");
    }).catch(() => { /* no session: the browser preview stays local */ });
    return () => { cancel = true; };
  }, [accountMode]);

  function choose(next: LayoutTemplate) {
    const sample = sampleLayout(next);
    setTemplate(next);
    setDraft(sample);
    setImageHref(null);
    setClipUrl(null);
    setZone(next === "triple-column" ? "column-0" : "menu");
    setSectionIndex(0);
    setVideoOn(frameFor(next, sample.split).video !== null);
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
    const snapshot: Snapshot = { doc, imageHref, videoOn: videoOn && !!videoBox };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
    setDraft(doc);
    setNote("Draft kept in this browser. No account was written.");
  }

  function publish() {
    const doc = checkedDraft();
    if (!doc) return;
    const box = mediaVideoBox(doc);
    const snapshot: Snapshot = {
      doc, imageHref, videoOn: videoOn && !!box,
      svg: layoutSvg(doc, { imageHref }),
      videoBox: box,
    };
    window.localStorage.setItem(PUBLISHED_KEY, JSON.stringify(snapshot));
    setDraft(doc);
    setPublished(snapshot);
    setNote("Published preview is frozen in this browser. It was not sent to an account or a screen.");
  }

  async function reloadAccount(preferId: string | null) {
    const loaded = readAccountStudio(await api<unknown>("/api/layout-studio"));
    if (!loaded) throw new Error("Couldn't reload the account.");
    setAccount(loaded);
    const board = boardAfterReload(loaded, preferId);
    if (!board) return loaded;
    setMenuId(board.id);
    setTemplate(board.document.template);
    setDraft(board.document);
    setImageHref(loaded.library.find((file) => file.id === board.document.imageMediaId)?.url ?? null);
    return loaded;
  }

  async function saveAccount(saveMode: "draft" | "publish") {
    if (saveLock.current) return;
    const doc = checkedDraft();
    if (!doc) return;
    saveLock.current = saveMode;
    setSaving(saveMode);
    setNote(saveMode === "publish" ? "Publishing…" : "Saving draft…");
    try {
      const body = await api<{ menuId?: string }>("/api/layout-studio", {
        method: "POST",
        body: JSON.stringify(accountSaveBody({ mode: saveMode, menuId, name: doc.title || "Menu", document: doc })),
      });
      const nextId = typeof body.menuId === "string" ? body.menuId : menuId;
      await reloadAccount(nextId);
      setNote(saveMode === "publish"
        ? "Published to this account. The player uses the new image."
        : "Draft saved on this account. Screens were not moved.");
    } catch (err) {
      setNote((err as Error).message || (saveMode === "publish" ? "Couldn't publish that board." : "Couldn't save that draft."));
    } finally {
      setSaving(null);
      setTimeout(() => { saveLock.current = null; }, 0);
    }
  }

  function openZone(next: string) {
    setZone(next);
    if (next.startsWith("column-")) {
      const index = Number(next.slice("column-".length));
      setSectionIndex(Number.isFinite(index) ? index : 0);
      setStep("section");
      return;
    }
    if (next === "menu") { setStep("section"); return; }
    if (next === "background") { setStep("content"); return; }
    setStep("content");
  }

  function onPhoto(file: File | undefined) {
    if (!file) { removePhoto(); return; }
    if (file.type !== "image/jpeg" && file.type !== "image/png" && file.type !== "image/webp") { setNote("Use a JPEG, PNG, or WebP."); return; }
    const local = URL.createObjectURL(file);
    setImageHref(local);
    if (!accountMode && !sessionToken) {
      if (file.size > 1_500_000) { setNote("Use a photo under 1.5 MB."); setImageHref(null); return; }
      const reader = new FileReader();
      reader.onload = () => setImageHref(typeof reader.result === "string" ? reader.result : local);
      reader.readAsDataURL(file);
      setNote("Photo is in the preview only. It was not uploaded to the library.");
      return;
    }
    setProgress("Uploading photo… 0%");
    const form = new FormData();
    form.set("file", file);
    form.set("name", file.name);
    const send = sessionToken
      ? uploadForm("/api/media", form, sessionToken, (percent) => setProgress(`Uploading photo… ${percent}%`))
      : authToken().then((token) => uploadForm("/api/media", form, token, (percent) => setProgress(`Uploading photo… ${percent}%`)));
    send.then(async (body) => {
      const loaded = await reloadAccount(menuId);
      const entry = loaded.library.find((item) => item.id === body.id) ?? null;
      if (entry) setDraft((current) => applyLibraryFile(current, entry, "photo"));
      else if (body.id) setDraft((current) => ({ ...current, imageMediaId: body.id ?? null }));
      setImageHref(entry?.url || local);
      setProgress(null);
      setNote("Photo is in this account's library and on the preview.");
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
    if (!videoBox) { setNote("This layout has no video area."); return; }
    if (!accountMode && !sessionToken) { setNote("Video upload uses your media library. Sign in to add one."); return; }
    const local = URL.createObjectURL(file);
    setClipUrl(local);
    setVideoOn(true);
    setProgress(draft.videoMediaId ? "Replacing video… 0%" : "Uploading video… 0%");
    try {
      const prepared = await prepareVideo(file);
      const signed = await api<{ mediaId: string; signedUrl: string }>("/api/media/upload", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, sizeBytes: file.size }),
      });
      await uploadToSignedUrl(signed.signedUrl, file, (percent) => {
        setProgress(`${draft.videoMediaId ? "Replacing" : "Uploading"} video… ${percent}%`);
      }, file.name);
      setProgress("Saving video…");
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
      const loaded = await reloadAccount(menuId);
      const entry = loaded.library.find((item) => item.id === signed.mediaId) ?? null;
      setDraft((current) => entry ? applyLibraryFile(current, entry, "video") : { ...current, videoMediaId: signed.mediaId });
      if (entry?.url) setClipUrl(null);
      setProgress(null);
      setNote("Video is selected. The preview plays it in the zone, and publish sends that one file.");
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
  const menuZone = zone === "menu" || zone.startsWith("column-");
  const featureZone = zone === "feature";
  const backgroundZone = zone === "background";
  const photoLabel = backgroundZone || template === "signature" ? "Background image" : "Feature photo";

  return (
    <main className="studio-app" style={{ minHeight: "100vh", background: "#efe8dc", color: "#1a1614", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <div className="studio-grid" style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 72px", display: "grid", gap: 28, gridTemplateColumns: "minmax(280px, 380px) minmax(0, 1fr)" }}>
        <section className="studio-controls">
          <p style={{ letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12, margin: 0 }}>{accountMode ? "Media" : "Isolated preview"}</p>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, margin: "8px 0" }}>Layout Studio</h1>
          <p style={{ lineHeight: 1.5, marginTop: 0 }}>{accountMode ? "Choose a template, fill each area, then publish. A draft stays off the screens." : "Edit the board, then open the player check. This page does not write an account."}</p>

          <div className={step === "template" ? "studio-pane on" : "studio-pane"} data-step="template">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0" }}>
              {TEMPLATES.map((id) => (
                <button key={id} type="button" onClick={() => choose(id)} style={chip(id === template)}>{templateSpec(id).name}</button>
              ))}
            </div>
            <label style={fieldLabel}>Title
              <input style={field} value={draft.title} maxLength={MENU_LIMITS.title} onChange={(event) => update({ ...draft, title: event.target.value })} />
            </label>
            <label style={fieldLabel}>Subtitle
              <input style={field} value={draft.subtitle} maxLength={MENU_LIMITS.subtitle} onChange={(event) => update({ ...draft, subtitle: event.target.value })} />
            </label>
            <label style={fieldLabel}>Footer
              <input style={field} value={draft.footer} maxLength={MENU_LIMITS.footer} onChange={(event) => update({ ...draft, footer: event.target.value })} />
            </label>
          </div>

          <div className={step === "section" ? "studio-pane on" : "studio-pane"} data-step="section">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0" }}>
              {draft.sections.map((section, index) => (
                <button key={index} type="button" style={chip(index === activeSection)} onClick={() => { setSectionIndex(index); setZone(template === "triple-column" ? `column-${index}` : "menu"); }}>
                  {template === "triple-column" ? `Column ${index + 1}` : section.name || `Section ${index + 1}`}
                </button>
              ))}
            </div>
            {draft.sections.map((section, si) => (
              <fieldset key={si} className={si === activeSection ? "section-block on" : "section-block"} style={{ border: "1px solid #ddd4c6", borderRadius: 12, margin: "12px 0", padding: 12 }}>
                <legend>{template === "triple-column" ? `Column ${si + 1}` : `Section ${si + 1}`}</legend>
                <input aria-label={`Section ${si + 1} name`} style={field} value={section.name} maxLength={MENU_LIMITS.sectionName}
                  onChange={(event) => update({ ...draft, sections: draft.sections.map((s, i) => i === si ? { ...s, name: event.target.value } : s) })} />
                {section.items.map((item, ii) => (
                  <div key={ii} className="item-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 5.5rem auto", gap: 6, marginTop: 8 }}>
                    <input aria-label={`Item ${ii + 1} in section ${si + 1}`} style={field} placeholder="Item" value={item.name} maxLength={MENU_LIMITS.itemName}
                      onChange={(event) => setItem(draft, si, ii, { name: event.target.value }, update)} />
                    <input aria-label={`Price ${ii + 1} in section ${si + 1}`} style={field} placeholder="$0" value={item.price} maxLength={MENU_LIMITS.price}
                      onChange={(event) => setItem(draft, si, ii, { price: event.target.value }, update)} />
                    <button type="button" aria-label={`Remove item ${ii + 1} in section ${si + 1}`} style={chip(false)}
                      onClick={() => update({ ...draft, sections: draft.sections.map((s, i) => i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s) })}>×</button>
                    <input aria-label={`Description ${ii + 1} in section ${si + 1}`} style={{ ...field, gridColumn: "1 / -1" }} placeholder="Description" value={item.description} maxLength={MENU_LIMITS.description}
                      onChange={(event) => setItem(draft, si, ii, { description: event.target.value }, update)} />
                  </div>
                ))}
                <button type="button" style={{ ...chip(false), marginTop: 8 }} onClick={() => update({ ...draft, sections: draft.sections.map((s, i) => i === si ? { ...s, items: [...s.items, blankItem()] } : s) })}>Add item</button>
                {template === "triple-column" && si === draft.sections.length - 1 ? (
                  <>
                    <p style={{ fontSize: 13, color: "#5c534c" }}>A photo sits behind all three columns. A video is not added, because it would cover a column.</p>
                    <label style={fieldLabel}>Upload new
                      <input aria-label="Column photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onPhoto(event.target.files?.[0])} />
                    </label>
                  </>
                ) : null}
              </fieldset>
            ))}
            {template === "triple-column" ? null : (
              <button type="button" style={chip(false)} onClick={() => update({ ...draft, sections: [...draft.sections, { name: "Section", items: [blankItem()] }] })}>Add section</button>
            )}
          </div>

          <div className={step === "content" ? "studio-pane on" : "studio-pane"} data-step="content">
            <p style={{ fontSize: 14 }}>Editing {zoneLabel(zone, template)}</p>
            <div className={menuZone ? "zone-panel on" : "zone-panel"} data-zone-panel="menu">
              <p style={{ fontSize: 14 }}>This area is the menu. Its sections and items are the only text it takes. Select the feature on the TV preview to add a photo or video.</p>
            </div>
            <div className={featureZone ? "zone-panel on" : "zone-panel"} data-zone-panel="feature">
              {template === "split-50" || template === "signature" || template === "menu-promo-67" || template === "menu-banner" ? (
                <>
                  <label style={fieldLabel}>{template === "split-50" ? "Right side title" : template === "signature" ? "Side title" : "Feature title"}
                    <input aria-label={template === "split-50" ? "Right side title" : "Feature title"} style={field} value={draft.featureTitle} maxLength={40}
                      onChange={(event) => update({ ...draft, featureTitle: event.target.value })} />
                  </label>
                  <label style={fieldLabel}>{template === "split-50" ? "Right side detail" : template === "signature" ? "Side detail" : "Feature detail"}
                    <input aria-label={template === "split-50" ? "Right side detail" : "Feature detail"} style={field} value={draft.featureDetail} maxLength={80}
                      onChange={(event) => update({ ...draft, featureDetail: event.target.value })} />
                  </label>
                </>
              ) : <p style={{ fontSize: 14 }}>This layout has no promotion text.</p>}
              <ZoneMedia
                photoLabel={photoLabel}
                allowVideo={Boolean(videoBox)}
                draft={draft}
                account={account}
                progress={progress}
                onPhoto={onPhoto}
                onVideo={onVideo}
                removePhoto={removePhoto}
                removeVideo={removeVideo}
                update={update}
                onLibraryPhoto={(entry) => {
                  update(applyLibraryFile(draft, entry, "photo"));
                  setImageHref(entry?.url ?? null);
                }}
                onLibraryVideo={(entry) => {
                  const next = applyLibraryFile(draft, entry, "video");
                  update(next);
                  setClipUrl(null);
                  setVideoOn(Boolean(next.videoMediaId));
                }}
              />
            </div>
            <div className={backgroundZone ? "zone-panel on" : "zone-panel"} data-zone-panel="background">
              <label style={fieldLabel}>Menu background
                <input type="color" aria-label="Menu background" value={draft.backgroundColor || "#f6f9fe"} onChange={(event) => update({ ...draft, backgroundColor: event.target.value })} />
              </label>
              <ZoneMedia
                photoLabel="Background image"
                allowVideo={false}
                draft={draft}
                account={account}
                progress={progress}
                onPhoto={onPhoto}
                onVideo={onVideo}
                removePhoto={removePhoto}
                removeVideo={removeVideo}
                update={update}
                onLibraryPhoto={(entry) => {
                  update(applyLibraryFile(draft, entry, "photo"));
                  setImageHref(entry?.url ?? null);
                }}
                onLibraryVideo={() => undefined}
              />
            </div>
          </div>

          <div className={step === "style" ? "studio-pane on" : "studio-pane"} data-step="style">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
              {(["classic", "fresh", "bold"] as const).map((palette) => (
                <button key={palette} type="button" style={chip(draft.palette === palette)} onClick={() => update({ ...draft, palette })}>{palette}</button>
              ))}
            </div>
            <label style={fieldLabel}>Text color
              <input type="color" aria-label="Text color" value={draft.textColor || "#0b1220"} onChange={(event) => update({ ...draft, textColor: event.target.value })} />
            </label>
            <label style={fieldLabel}>Menu background
              <input type="color" aria-label="Menu background" value={draft.backgroundColor || "#f6f9fe"} onChange={(event) => update({ ...draft, backgroundColor: event.target.value })} />
            </label>
            <label style={fieldLabel}>Feature color
              <input type="color" aria-label="Primary color" value={draft.primaryColor || "#0066ff"} onChange={(event) => update({ ...draft, primaryColor: event.target.value })} />
            </label>
            <label style={fieldLabel}>Accent color
              <input type="color" aria-label="Accent color" value={draft.accentColor || "#ffd34d"} onChange={(event) => update({ ...draft, accentColor: event.target.value })} />
            </label>
            <button type="button" style={chip(false)} onClick={() => update({ ...draft, primaryColor: null, accentColor: null, textColor: null, backgroundColor: null })}>Use built-in colors</button>
            <label style={fieldLabel}>Type size
              <select aria-label="Type size" value={draft.typeScale} onChange={(event) => update({ ...draft, typeScale: event.target.value === "counter" ? "counter" : "room" })}>
                <option value="room">Room — for a television</option>
                <option value="counter">Counter — slightly denser</option>
              </select>
            </label>
            <label style={fieldLabel}>Font
              <select aria-label="Font" value={draft.font} onChange={(event) => update({ ...draft, font: event.target.value === "noto-serif" ? "noto-serif" : "inter" })}>
                <option value="inter">Inter</option>
                <option value="noto-serif">Noto Serif</option>
              </select>
            </label>
            <p style={{ fontSize: 13, color: "#5c534c" }}>Inter and Noto Serif on this page are the same files drawn into the published image.</p>
            <label style={fieldLabel}>Photo fit
              <select aria-label="Photo fit" value={draft.imageFit} onChange={(event) => update({ ...draft, imageFit: event.target.value === "contain" ? "contain" : "cover" })}>
                <option value="cover">Fill the area</option>
                <option value="contain">Fit inside the area</option>
              </select>
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
            {template === "triple-column" ? <ColumnWidths draft={draft} update={update} /> : null}
          </div>

          <div className={step === "publish" ? "studio-pane on" : "studio-pane"} data-step="publish">
            {account ? (
              <label style={fieldLabel}>Saved board
                <select aria-label="Saved board" value={menuId ?? ""} onChange={(event) => {
                  const id = event.target.value;
                  const board = account.boards.find((item) => item.id === id);
                  setMenuId(id || null);
                  if (!board) return;
                  setTemplate(board.document.template);
                  setDraft(board.document);
                  setImageHref(account.library.find((file) => file.id === board.document.imageMediaId)?.url ?? null);
                  setClipUrl(null);
                }}>
                  <option value="">New board</option>
                  {account.boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
                </select>
              </label>
            ) : null}
            {account?.legacy.length ? <p style={{ fontSize: 13, color: "#5c534c" }}>Classic menus stay in the menu editor: {account.legacy.map((item) => item.name).join(", ")}.</p> : null}
            {accountMode ? null : (
              <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
                <input type="checkbox" checked={videoOn && !!videoBox && !draft.videoMediaId} disabled={!videoBox || Boolean(draft.videoMediaId)} onChange={(event) => setVideoOn(event.target.checked)} />
                Play the bundled demo in the safe area
              </label>
            )}
            {progress ? <p role="status">{progress}</p> : null}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {accountMode ? null : <button type="button" style={chip(false)} onClick={saveDraft}>Save draft</button>}
              {accountMode ? null : <button type="button" style={{ ...chip(true), background: "#1a1614", color: "#f3ecdf" }} onClick={publish}>Publish preview</button>}
              {accountMode || account ? <button type="button" style={chip(false)} disabled={saving !== null} onClick={() => { void saveAccount("draft"); }}>{saving === "draft" ? "Saving…" : "Save draft"}</button> : null}
              {accountMode || account ? <button type="button" style={{ ...chip(true), background: "#1a1614", color: "#f3ecdf" }} disabled={saving !== null} onClick={() => { void saveAccount("publish"); }}>{saving === "publish" ? "Publishing…" : "Publish"}</button> : null}
              {accountMode ? <a href="/dashboard/media/menus" style={{ ...chip(false), textDecoration: "none" }}>Menu boards</a> : <a href="/layout-studio/player" style={{ ...chip(false), textDecoration: "none" }}>Open player check</a>}
            </div>
            <p role="alert" style={{ fontSize: 14, color: "#5c534c" }}>{note}</p>
          </div>
        </section>
        <section className="studio-preview" aria-label="TV preview">
          <p style={{ margin: "0 0 8px", fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase" }}>TV preview</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <button type="button" style={chip(backgroundZone)} onClick={() => openZone("background")}>Edit background</button>
          </div>
          <Stage
            svg={svg}
            video={showZone ? videoBox : null}
            videoSrc={zoneSrc}
            label="TV output"
            hits={previewHits(template, frame)}
            active={zone}
            onHit={openZone}
          />
          {!accountMode && published ? <Stage svg={published.svg || layoutSvg(published.doc, { imageHref: published.imageHref })} video={published.videoOn ? published.videoBox || frameFor(published.doc.template, published.doc.split, published.doc.columnWidths).video : null} videoSrc={libraryVideoUrl(account, published.doc.videoMediaId, false)} label="Published preview" hits={[]} active="" onHit={() => undefined} /> : null}
          {!accountMode && !published ? <p>No published preview yet.</p> : null}
        </section>
      </div>
      <nav className="studio-tabs" role="tablist" aria-label="Editor steps">
        {(["template", "section", "content", "style", "publish"] as const).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={step === id} style={chip(step === id)} onClick={() => setStep(id)}>{stepLabel(id)}</button>
        ))}
      </nav>
      <style>{`
        .studio-app { overflow-x: hidden; }
        .studio-tabs { display: none; }
        .zone-panel { display: none; }
        .zone-panel.on { display: block; }
        @media (max-width: 860px) {
          .studio-grid { display: flex !important; flex-direction: column; overflow-x: hidden; max-width: 100%; padding: 12px 12px 96px !important; }
          .studio-controls, .studio-preview { max-width: 100%; min-width: 0; overflow-x: hidden; }
          .studio-preview { position: sticky; top: 0; z-index: 2; order: -1; background: #efe8dc; padding-bottom: 8px; }
          .studio-preview figure { border: 3px solid #1a1614; margin: 0 0 8px; }
          .studio-tabs { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 4; background: #fffdf8; border-top: 1px solid #ddd4c6; padding: 6px; gap: 4px; }
          .studio-tabs button { flex: 1 1 0; min-height: 44px; min-width: 44px; }
          .studio-pane, .section-block, .zone-panel { display: none; }
          .studio-pane.on, .section-block.on, .zone-panel.on { display: block; }
          .item-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .studio-controls input, .studio-controls select, .studio-controls button, .studio-controls a { min-height: 44px; max-width: 100%; }
        }
        @media (min-width: 861px) {
          .studio-tabs { display: none !important; }
          .studio-pane, .section-block { display: block; }
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
    <figure style={{ margin: "0 0 18px", background: "#000", borderRadius: 16, overflow: "hidden" }}>
      <figcaption style={{ color: "#f3ecdf", padding: "10px 14px", fontSize: 13 }}>{label}</figcaption>
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
          {hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              aria-label={hit.label}
              onClick={() => onHit(hit.id)}
              style={{
                position: "absolute", left: hit.box.x, top: hit.box.y, width: hit.box.w, height: hit.box.h,
                background: active === hit.id ? "rgba(255, 211, 77, 0.18)" : "transparent",
                border: active === hit.id ? "4px solid #ffd34d" : "0",
                cursor: "pointer", padding: 0,
              }}
            />
          ))}
        </div>
      </div>
    </figure>
  );
}


function zoneLabel(zone: string, template: LayoutTemplate) {
  if (zone.startsWith("column-")) return `column ${Number(zone.slice("column-".length)) + 1}`;
  if (zone === "feature") return template === "menu-banner" ? "the banner" : "the feature";
  if (zone === "background") return "the background";
  return "the menu";
}

function previewHits(template: LayoutTemplate, frame: ReturnType<typeof frameFor>) {
  if (template === "triple-column") {
    return frame.columns.map((box, index) => ({ id: `column-${index}`, label: `Edit column ${index + 1}`, box }));
  }
  const hits: { id: string; label: string; box: { x: number; y: number; w: number; h: number } }[] = [];
  if (template === "signature") {
    hits.push({ id: "background", label: "Edit background zone", box: frame.feature });
    if (frame.video) hits.push({ id: "feature", label: "Edit feature zone", box: frame.video });
    hits.push({ id: "menu", label: "Edit menu zone", box: { x: 48, y: 48, w: Math.max(80, frame.menu.w - 96), h: 1080 - 96 } });
    return hits;
  }
  hits.push({ id: "menu", label: "Edit menu zone", box: frame.menu });
  if (frame.video) hits.push({ id: "feature", label: "Edit feature zone", box: frame.video });
  return hits;
}

function ZoneMedia({
  photoLabel, allowVideo, draft, account, progress, onPhoto, onVideo, removePhoto, removeVideo, update, onLibraryPhoto, onLibraryVideo,
}: {
  photoLabel: string;
  allowVideo: boolean;
  draft: LayoutDocument;
  account: AccountStudio | null;
  progress: string | null;
  onPhoto: (file: File | undefined) => void;
  onVideo: (file: File | undefined) => void;
  removePhoto: () => void;
  removeVideo: () => void;
  update: (next: LayoutDocument) => void;
  onLibraryPhoto: (entry: AccountLibraryFile | null) => void;
  onLibraryVideo: (entry: AccountLibraryFile | null) => void;
}) {
  return (
    <div>
      {progress ? <p role="status">{progress}</p> : null}
      <label style={fieldLabel}>{photoLabel}
        <input aria-label={photoLabel} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onPhoto(event.target.files?.[0])} />
      </label>
      <p style={{ fontSize: 13, margin: "4px 0" }}>Upload new</p>
      {allowVideo ? (
        <label style={fieldLabel}>Upload new
          <input aria-label="Upload video" type="file" accept="video/mp4" onChange={(event) => onVideo(event.target.files?.[0])} />
        </label>
      ) : null}
      {account ? (
        <>
          <label style={fieldLabel}>Choose from library
            <select aria-label="Library photo" value={draft.imageMediaId ?? ""} onChange={(event) => onLibraryPhoto(account.library.find((item) => item.id === event.target.value) ?? null)}>
              <option value="">No photo</option>
              {account.library.filter((item) => item.kind === "image").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {allowVideo ? (
            <label style={fieldLabel}>Choose from library
              <select aria-label="Library video" value={draft.videoMediaId ?? ""} onChange={(event) => onLibraryVideo(account.library.find((item) => item.id === event.target.value) ?? null)}>
                <option value="">No video</option>
                {account.library.filter((item) => item.kind === "video").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          ) : null}
        </>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={chip(false)} onClick={removePhoto}>Remove photo</button>
        {allowVideo ? <button type="button" style={chip(false)} onClick={removeVideo}>Remove video</button> : null}
      </div>
      <label style={fieldLabel}>Photo fit
        <select aria-label="Photo fit" value={draft.imageFit} onChange={(event) => update({ ...draft, imageFit: event.target.value === "contain" ? "contain" : "cover" })}>
          <option value="cover">Fill the area</option>
          <option value="contain">Fit inside the area</option>
        </select>
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
      {allowVideo ? <p style={{ fontSize: 13, color: "#5c534c" }}>{draft.videoMediaId ? "This board already has its one video. Uploading another replaces it." : "A board plays one video, muted, for the length of the slide."}</p> : null}
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

function stepLabel(step: "template" | "section" | "content" | "style" | "publish") {
  if (step === "template") return "Template";
  if (step === "section") return "Section";
  if (step === "content") return "Content";
  if (step === "style") return "Style";
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
  if (template === "signature") return "Menu card width";
  if (template === "split-50") return "Left side";
  return "Menu width";
}

function proportionNote(template: LayoutTemplate) {
  if (template === "triple-column") return "Each column is 20% to 60% and the three widths add up to the full board. This layout has no video area.";
  if (template === "menu-banner") return "Banner height is 12% to 28% of the board. The menu uses the space above it.";
  if (template === "menu-promo-67") return "Menu width is 55% to 75%. The promotion uses the rest.";
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
