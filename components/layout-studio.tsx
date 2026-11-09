"use client";

import { useMemo, useState } from "react";
import { frameFor, layoutSvg, sampleLayout, templateSpec, type LayoutDocument, type LayoutTemplate } from "@/lib/layout-studio";

const TEMPLATES: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature"];

export function LayoutStudio() {
  const [template, setTemplate] = useState<LayoutTemplate>("menu-promo-67");
  const [draft, setDraft] = useState<LayoutDocument>(() => sampleLayout("menu-promo-67"));
  const [published, setPublished] = useState<LayoutDocument | null>(null);
  const spec = templateSpec(template);
  const svg = useMemo(() => layoutSvg(draft), [draft]);
  const frame = frameFor(draft.template, draft.split);

  function choose(next: LayoutTemplate) {
    setTemplate(next);
    setDraft(sampleLayout(next));
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f6f1e7", color: "#1c1917", fontFamily: "Inter, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 64px" }}>
        <p style={{ letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12, color: "#57534e" }}>Isolated preview</p>
        <h1 style={{ fontSize: 36, fontWeight: 650, margin: "8px 0 8px" }}>Layout Studio</h1>
        <p style={{ maxWidth: 640, lineHeight: 1.5 }}>
          This page does not save to an account. Publishing here only freezes this preview.
          Screens keep using the current player until the feature flag is turned on.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "24px 0" }}>
          {TEMPLATES.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => choose(id)}
              style={{
                border: id === template ? "2px solid #1c1917" : "1px solid #d6d3d1",
                background: "#fff",
                borderRadius: 999,
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              {templateSpec(id).name}
            </button>
          ))}
        </div>
        <label style={{ display: "block", maxWidth: 420 }}>
          Proportion {Math.round(draft.split * 100)}%
          <input
            type="range"
            min={spec.min}
            max={spec.max}
            step={0.01}
            value={draft.split}
            onChange={(event) => setDraft({ ...draft, split: Number(event.target.value) })}
            style={{ width: "100%" }}
          />
        </label>
        <div style={{ display: "flex", gap: 8, margin: "16px 0 24px" }}>
          <button type="button" onClick={() => setPublished({ ...draft })} style={{ ...button, background: "#1c1917", color: "#f6f1e7" }}>Publish preview</button>
        </div>
        <style>{`figure svg { width: 100%; height: auto; display: block; }`}</style>
        <p style={{ fontSize: 14, color: "#57534e" }}>
          {published ? "Published preview is frozen below the editor. Nothing was written to a screen." : "No published preview yet."}
          {" "}Video slot {frame.feature.w}×{frame.feature.h}. One muted video is the proposed limit, not a device test.
        </p>
        <figure style={{ margin: "16px 0", background: "#000", borderRadius: 12, overflow: "hidden", aspectRatio: "16 / 9" }}>
          <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: svg }} />
        </figure>
        {published ? (
          <figure style={{ margin: 0, background: "#000", borderRadius: 12, overflow: "hidden", aspectRatio: "16 / 9" }}>
            <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: layoutSvg(published) }} />
          </figure>
        ) : null}
      </div>
    </main>
  );
}

const button = {
  border: 0,
  borderRadius: 999,
  padding: "10px 16px",
  background: "#fff",
  cursor: "pointer",
};
