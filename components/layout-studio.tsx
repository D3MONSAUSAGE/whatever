"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  accountSaveBody, applyLibraryFile, boardAfterReload, readAccountStudio,
  type AccountStudio,
} from "@/lib/layout-account";
import {
  containedBoard, frameFor, layoutSvg, MENU_LIMITS, parseLayout, sampleLayout, templateSpec,
  type LayoutDocument, type LayoutItem, type LayoutTemplate,
} from "@/lib/layout-studio";
import { api } from "@/lib/api";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";

const TEMPLATES: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature"];
const DRAFT_KEY = "layout-studio-draft-v1";
const PUBLISHED_KEY = "layout-studio-published-v1";

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
  const frame = frameFor(draft.template, draft.split);
  const svg = useMemo(() => layoutSvg(draft, { imageHref }), [draft, imageHref]);
  const videoBox = frame.video;
  const librarySrc = libraryVideoUrl(account, draft.videoMediaId, !accountMode && videoOn && !draft.videoMediaId);
  const showZone = Boolean(videoBox) && (accountMode ? Boolean(draft.videoMediaId && librarySrc) : videoOn || Boolean(draft.videoMediaId));
  const zoneSrc = librarySrc || "/layout-studio/media/promo";

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
    setVideoOn(frameFor(next, sample.split).video !== null);
  }

  function update(next: LayoutDocument) {
    setDraft(next);
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
    const box = frameFor(doc.template, doc.split).video;
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
    const doc = checkedDraft();
    if (!doc) return;
    const body = await api<{ menuId?: string }>("/api/layout-studio", {
      method: "POST",
      body: JSON.stringify(accountSaveBody({ mode: saveMode, menuId, name: doc.title || "Menu", document: doc })),
    });
    const nextId = typeof body.menuId === "string" ? body.menuId : menuId;
    await reloadAccount(nextId);
    setNote(saveMode === "publish"
      ? "Published to this account. The player uses the new image."
      : "Draft reloaded from this account. Screens were not moved.");
  }

  function onPhoto(file: File | undefined) {
    if (!file) { setImageHref(null); return; }
    if (file.type !== "image/jpeg" && file.type !== "image/png") { setNote("Use a JPEG or PNG."); return; }
    if (!accountMode && file.size > 1_500_000) { setNote("Use a photo under 1.5 MB."); return; }
    if (accountMode || sessionToken) {
      const form = new FormData();
      form.set("file", file);
      form.set("name", file.name);
      const send = accountMode
        ? api<{ id: string }>("/api/media", { method: "POST", body: form })
        : fetch("/api/media", { method: "POST", headers: { Authorization: `Bearer ${sessionToken}` }, body: form }).then(async (res) => {
          const body = await res.json().catch(() => ({})) as { id?: string; error?: string };
          if (!res.ok || !body.id) throw new Error(body.error || "Couldn't upload that photo.");
          return body;
        });
      send.then(async (body) => {
        const loaded = await reloadAccount(menuId);
        const entry = loaded.library.find((item) => item.id === body.id) ?? null;
        if (entry) {
          setDraft((current) => applyLibraryFile(current, entry, "photo"));
          setImageHref(entry.url);
        }
        setNote("Photo is in this account's library.");
      }).catch((err: Error) => setNote(err.message || "Couldn't upload that photo."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const href = typeof reader.result === "string" ? reader.result : null;
      setImageHref(href);
      setNote("Photo is in the preview only. It was not uploaded to the library.");
    };
    reader.readAsDataURL(file);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#efe8dc", color: "#1a1614", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 72px", display: "grid", gap: 28, gridTemplateColumns: "minmax(280px, 380px) minmax(0, 1fr)" }}>
        <section>
          <p style={{ letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12, margin: 0 }}>{accountMode ? "Media" : "Isolated preview"}</p>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, margin: "8px 0" }}>Layout Studio</h1>
          <p style={{ lineHeight: 1.5, marginTop: 0 }}>{accountMode ? "Save a draft on this account without moving screens. Publish renders the board and updates the screens that already show this menu." : "Edit the board, then open the player check. This page does not write an account."}</p>
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
          <label style={fieldLabel}>{proportionLabel(template)} {Math.round(draft.split * 100)}%
            <input type="range" min={spec.min} max={spec.max} step={0.01} value={draft.split} aria-describedby="proportion-note"
              onChange={(event) => update({ ...draft, split: Number(event.target.value) })} />
          </label>
          <p id="proportion-note" style={{ fontSize: 13, color: "#5c534c", marginTop: 0 }}>{proportionNote(template)}</p>
          {template === "split-50" || template === "signature" || template === "menu-promo-67" ? (
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
          ) : null}
          {draft.sections.map((section, si) => (
            <fieldset key={si} style={{ border: "1px solid #ddd4c6", borderRadius: 12, margin: "12px 0", padding: 12 }}>
              <legend>{template === "triple-column" ? `Column ${si + 1}` : `Section ${si + 1}`}</legend>
              <input aria-label={`Section ${si + 1} name`} style={field} value={section.name} maxLength={MENU_LIMITS.sectionName}
                onChange={(event) => update({ ...draft, sections: draft.sections.map((s, i) => i === si ? { ...s, name: event.target.value } : s) })} />
              {section.items.map((item, ii) => (
                <div key={ii} style={{ display: "grid", gridTemplateColumns: "1fr 5.5rem auto", gap: 6, marginTop: 8 }}>
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
            </fieldset>
          ))}
          {template === "triple-column" ? <p style={{ fontSize: 13, color: "#5c534c" }}>Each column keeps its own section. A video is not added, because it would cover a column.</p> : (
            <button type="button" style={chip(false)} onClick={() => update({ ...draft, sections: [...draft.sections, { name: "Section", items: [blankItem()] }] })}>Add section</button>
          )}
          {account ? (
            <>
              <label style={fieldLabel}>Saved board
                <select aria-label="Saved board" value={menuId ?? ""} onChange={(event) => {
                  const id = event.target.value;
                  const board = account.boards.find((item) => item.id === id);
                  setMenuId(id || null);
                  if (!board) return;
                  setTemplate(board.document.template);
                  setDraft(board.document);
                  setImageHref(account.library.find((file) => file.id === board.document.imageMediaId)?.url ?? null);
                }}>
                  <option value="">New board</option>
                  {account.boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
                </select>
              </label>
              <label style={fieldLabel}>Library photo
                <select aria-label="Library photo" value={draft.imageMediaId ?? ""} onChange={(event) => {
                  const entry = account.library.find((item) => item.id === event.target.value) ?? null;
                  update(applyLibraryFile(draft, entry && entry.kind === "image" ? entry : null, "photo"));
                  setImageHref(entry?.url ?? null);
                }}>
                  <option value="">No photo</option>
                  {account.library.filter((item) => item.kind === "image").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label style={fieldLabel}>Library video
                <select aria-label="Library video" value={draft.videoMediaId ?? ""} onChange={(event) => {
                  const entry = account.library.find((item) => item.id === event.target.value) ?? null;
                  const next = applyLibraryFile(draft, entry && entry.kind === "video" ? entry : null, "video");
                  update(next);
                  setVideoOn(Boolean(next.videoMediaId));
                }}>
                  <option value="">No video</option>
                  {account.library.filter((item) => item.kind === "video").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              {account.legacy.length ? <p style={{ fontSize: 13, color: "#5c534c" }}>Classic menus stay in the menu editor: {account.legacy.map((item) => item.name).join(", ")}.</p> : null}
            </>
          ) : null}
          <label style={{ ...fieldLabel, marginTop: 16 }}>{template === "signature" ? "Background image" : "Photo for the feature area"}
            <input aria-label={template === "signature" ? "Background image" : "Feature photo"} type="file" accept="image/jpeg,image/png" onChange={(event) => onPhoto(event.target.files?.[0])} />
          </label>
          {accountMode ? null : (
            <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
              <input type="checkbox" checked={videoOn && !!videoBox && !draft.videoMediaId} disabled={!videoBox || Boolean(draft.videoMediaId)} onChange={(event) => setVideoOn(event.target.checked)} />
              Play the bundled demo in the safe area
            </label>
          )}
          {draft.videoMediaId ? <p style={{ fontSize: 13, color: "#5c534c" }}>Publish sends the selected library video. A screen plays that file in the safe area.</p> : null}
          {!videoBox ? <p style={{ fontSize: 14 }}>This layout is three menu columns. A video would cover one of them, so it stays a still.</p> : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {accountMode ? null : <button type="button" style={chip(false)} onClick={saveDraft}>Save draft</button>}
            {accountMode ? null : <button type="button" style={{ ...chip(true), background: "#1a1614", color: "#f3ecdf" }} onClick={publish}>Publish preview</button>}
            {accountMode || account ? <button type="button" style={chip(false)} onClick={() => saveAccount("draft").catch((err: Error) => setNote(err.message || "Couldn't reload the account."))}>Save draft</button> : null}
            {accountMode || account ? <button type="button" style={{ ...chip(true), background: "#1a1614", color: "#f3ecdf" }} onClick={() => saveAccount("publish").catch((err: Error) => setNote(err.message || "Couldn't reload the account."))}>Publish</button> : null}
            {accountMode ? <a href="/dashboard/media/menus" style={{ ...chip(false), textDecoration: "none" }}>Menu boards</a> : <a href="/layout-studio/player" style={{ ...chip(false), textDecoration: "none" }}>Open player check</a>}
          </div>
          <p role="alert" style={{ fontSize: 14, color: "#5c534c" }}>{note}</p>
        </section>
        <section>
          <Stage svg={svg} video={showZone ? videoBox : null} videoSrc={zoneSrc} label={accountMode ? "Board" : "Draft"} />
          {!accountMode && published ? <Stage svg={published.svg || layoutSvg(published.doc, { imageHref: published.imageHref })} video={published.videoOn ? published.videoBox || frameFor(published.doc.template, published.doc.split).video : null} videoSrc={libraryVideoUrl(account, published.doc.videoMediaId, false)} label="Published preview" /> : null}
          {!accountMode && !published ? <p>No published preview yet.</p> : null}
        </section>
      </div>
      <style>{`
        @media (max-width: 860px) { main > div { grid-template-columns: 1fr !important; } }
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

function Stage({ svg, video, videoSrc, label }: { svg: string; video: { x: number; y: number; w: number; h: number } | null; videoSrc: string; label: string }) {
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
              style={{ position: "absolute", left: video.x, top: video.y, width: video.w, height: video.h, objectFit: "contain", background: "transparent" }}
            />
          ) : null}
        </div>
      </div>
    </figure>
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

function proportionLabel(template: LayoutTemplate) {
  if (template === "menu-banner") return "Banner height";
  if (template === "triple-column") return "First column width";
  if (template === "signature") return "Menu card width";
  if (template === "split-50") return "Left side";
  return "Menu width";
}

function proportionNote(template: LayoutTemplate) {
  if (template === "triple-column") return "Only the first column is adjustable, from 25% to 45%. Columns 2 and 3 share the rest equally. There is no separate width for each column.";
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
