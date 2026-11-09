"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  frameFor, layoutSvg, MENU_LIMITS, parseLayout, sampleLayout, templateSpec,
  type LayoutDocument, type LayoutItem, type LayoutTemplate,
} from "@/lib/layout-studio";

const TEMPLATES: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature"];
const DRAFT_KEY = "layout-studio-draft-v1";
const PUBLISHED_KEY = "layout-studio-published-v1";

type Snapshot = {
  doc: LayoutDocument;
  imageHref: string | null;
  videoOn: boolean;
  svg?: string;
  videoBox?: { x: number; y: number; w: number; h: number } | null;
  fontFamily?: "Inter" | "BoardFace";
};

function blankItem(): LayoutItem {
  return { name: "", price: "", description: "" };
}

export function LayoutStudio() {
  const [template, setTemplate] = useState<LayoutTemplate>("menu-promo-67");
  const [draft, setDraft] = useState<LayoutDocument>(() => sampleLayout("menu-promo-67"));
  const [imageHref, setImageHref] = useState<string | null>(null);
  const [fontUrl, setFontUrl] = useState<string | null>(null);
  const [videoOn, setVideoOn] = useState(true);
  const [published, setPublished] = useState<Snapshot | null>(null);
  const [note, setNote] = useState("Nothing is saved to an account.");
  const spec = templateSpec(template);
  const frame = frameFor(draft.template, draft.split);
  const fontFamily = fontUrl ? "BoardFace" as const : "Inter" as const;
  const svg = useMemo(() => layoutSvg(draft, { imageHref, fontFamily }), [draft, imageHref, fontFamily]);
  const videoBox = frame.video;

  useEffect(() => {
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
  }, []);

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
      doc, imageHref, videoOn: videoOn && !!box, fontFamily,
      svg: layoutSvg(doc, { imageHref, fontFamily }),
      videoBox: box,
    };
    window.localStorage.setItem(PUBLISHED_KEY, JSON.stringify(snapshot));
    setDraft(doc);
    setPublished(snapshot);
    setNote("Published preview is frozen in this browser. It was not sent to an account or a screen.");
  }

  function onFont(file: File | undefined) {
    if (!file) { setFontUrl(null); return; }
    if (file.size > 2_000_000) { setNote("Use a font file under 2 MB."); return; }
    setFontUrl(URL.createObjectURL(file));
    setNote("This font is for the preview only. Screens keep Inter.");
  }

  function onPhoto(file: File | undefined) {
    if (!file) { setImageHref(null); return; }
    if (file.type !== "image/jpeg" && file.type !== "image/png") { setNote("Use a JPEG or PNG."); return; }
    if (file.size > 1_500_000) { setNote("Use a photo under 1.5 MB for this preview."); return; }
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
          <p style={{ letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12, margin: 0 }}>Isolated preview</p>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, margin: "8px 0" }}>Layout Studio</h1>
          <p style={{ lineHeight: 1.5, marginTop: 0 }}>Edit the board, then open the real player check. This page does not sign in and does not write an account.</p>
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
          <label style={fieldLabel}>Primary color
            <input type="color" aria-label="Primary color" value={draft.primaryColor || "#0066ff"} onChange={(event) => update({ ...draft, primaryColor: event.target.value })} />
          </label>
          <label style={fieldLabel}>Accent color
            <input type="color" aria-label="Accent color" value={draft.accentColor || "#ffd34d"} onChange={(event) => update({ ...draft, accentColor: event.target.value })} />
          </label>
          <button type="button" style={chip(false)} onClick={() => update({ ...draft, primaryColor: null, accentColor: null })}>Use built-in colors</button>
          <label style={fieldLabel}>Type size
            <select aria-label="Type size" value={draft.typeScale} onChange={(event) => update({ ...draft, typeScale: event.target.value === "counter" ? "counter" : "room" })}>
              <option value="room">Room — for a television</option>
              <option value="counter">Counter — slightly denser</option>
            </select>
          </label>
          <label style={fieldLabel}>Font file for this preview
            <input type="file" accept=".ttf,.otf,font/ttf,font/otf" onChange={(event) => onFont(event.target.files?.[0])} />
          </label>
          <p style={{ fontSize: 13, color: "#5c534c" }}>A font file changes this preview only. Screens keep Inter, the same face as your other menus.</p>
          <label style={fieldLabel}>{proportionLabel(template)} {Math.round(draft.split * 100)}%
            <input type="range" min={spec.min} max={spec.max} step={0.01} value={draft.split}
              onChange={(event) => update({ ...draft, split: Number(event.target.value) })} />
          </label>
          {draft.sections.map((section, si) => (
            <fieldset key={si} style={{ border: "1px solid #ddd4c6", borderRadius: 12, margin: "12px 0", padding: 12 }}>
              <legend>Section {si + 1}</legend>
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
          <button type="button" style={chip(false)} onClick={() => update({ ...draft, sections: [...draft.sections, { name: "Section", items: [blankItem()] }] })}>Add section</button>
          <label style={{ ...fieldLabel, marginTop: 16 }}>Photo for the feature area
            <input type="file" accept="image/jpeg,image/png" onChange={(event) => onPhoto(event.target.files?.[0])} />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
            <input type="checkbox" checked={videoOn && !!videoBox} disabled={!videoBox} onChange={(event) => setVideoOn(event.target.checked)} />
            Play the demo video in the safe area
          </label>
          {!videoBox ? <p style={{ fontSize: 14 }}>This layout is three menu columns. A video would cover one of them, so it stays a still.</p> : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={chip(false)} onClick={saveDraft}>Save draft</button>
            <button type="button" style={{ ...chip(true), background: "#1a1614", color: "#f3ecdf" }} onClick={publish}>Publish preview</button>
            <a href="/layout-studio/player" style={{ ...chip(false), textDecoration: "none" }}>Open player check</a>
          </div>
          <p role="alert" style={{ fontSize: 14, color: "#5c534c" }}>{note}</p>
        </section>
        <section>
          <Stage svg={svg} video={videoOn && videoBox ? videoBox : null} label="Draft" />
          {published ? <Stage svg={published.svg || layoutSvg(published.doc, { imageHref: published.imageHref, fontFamily: published.fontFamily })} video={published.videoOn ? published.videoBox || frameFor(published.doc.template, published.doc.split).video : null} label="Published preview" /> : <p>No published preview yet.</p>}
        </section>
      </div>
      <style>{`
        @media (max-width: 860px) { main > div { grid-template-columns: 1fr !important; } }
        figure svg { width: 100%; height: 100%; display: block; }
        ${fontUrl ? `@font-face { font-family: BoardFace; src: url("${fontUrl}"); }` : ""}
      `}</style>
    </main>
  );
}

function Stage({ svg, video, label }: { svg: string; video: { x: number; y: number; w: number; h: number } | null; label: string }) {
  return (
    <figure style={{ margin: "0 0 18px", background: "#000", borderRadius: 16, overflow: "hidden" }}>
      <figcaption style={{ color: "#f3ecdf", padding: "10px 14px", fontSize: 13 }}>{label}</figcaption>
      <div style={{ position: "relative", aspectRatio: "16 / 9" }}>
        <div style={{ position: "absolute", inset: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
        {video ? (
          <video
            src="/layout-studio/media/promo"
            muted
            autoPlay
            loop
            playsInline
            style={{
              position: "absolute",
              left: `${(video.x / 1920) * 100}%`,
              top: `${(video.y / 1080) * 100}%`,
              width: `${(video.w / 1920) * 100}%`,
              height: `${(video.h / 1080) * 100}%`,
              objectFit: "contain",
              background: "transparent",
            }}
          />
        ) : null}
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
  if (template === "triple-column") return "First column";
  if (template === "signature") return "Menu card width";
  if (template === "split-50") return "Left side";
  return "Menu width";
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
