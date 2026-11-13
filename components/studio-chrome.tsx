"use client";

import { useEffect, useState } from "react";

/** SSR-safe: first render is "desktop" on server and client, then the effect narrows it. Avoids a hydration mismatch. */
export function useStudioBreakpoint(): "phone" | "tablet" | "desktop" {
  const [bp, setBp] = useState<"phone" | "tablet" | "desktop">("desktop");
  useEffect(() => {
    const phone = window.matchMedia("(max-width: 860px)");
    const desktop = window.matchMedia("(min-width: 1180px)");
    const apply = () => setBp(phone.matches ? "phone" : desktop.matches ? "desktop" : "tablet");
    apply();
    phone.addEventListener("change", apply);
    desktop.addEventListener("change", apply);
    return () => {
      phone.removeEventListener("change", apply);
      desktop.removeEventListener("change", apply);
    };
  }, []);
  return bp;
}

/** Shared workspace CSS for Layout Studio and the classic menu-board editor. */
export function StudioStyles() {
  return (
    <style>{`

        body:has(.studio-app) main.shell-main {
          max-width: none !important;
          width: auto;
          padding: 0.4rem 0.75rem 1rem !important;
        }
        body:has(.studio-app) nav[aria-label="Mobile"] { display: none !important; }
        body:has(.studio-app) .content-nav { display: none; }
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
        .section-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 8px; min-width: 0; }
        .section-card-head .section-card-legend { padding: 0; margin: 0; flex: 1 1 auto; min-width: 0; }
        .section-remove { border: 0; background: transparent; color: #8a3a32; font: inherit; font-size: 13px; font-weight: 650; min-height: 44px; min-width: 44px; padding: 0 8px; cursor: pointer; border-radius: 8px; flex: 0 0 auto; }
        .section-remove:hover { background: #fdecea; }
        .section-remove:focus-visible { outline: 3px solid #0066ff; outline-offset: 2px; }
        .item-card { display: grid; grid-template-columns: minmax(0, 1fr) 84px 44px; gap: 6px; align-items: start; padding: 8px 0; border-bottom: 1px solid #eef1f6; width: 100%; min-width: 0; box-sizing: border-box; }
        .item-card:last-of-type { border-bottom: 0; }
        .item-card .item-name, .item-card .item-price, .item-card .item-desc { box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%; border: 1px solid #ddd4c6; border-radius: 8px; padding: 8px 10px; font: inherit; min-height: 44px; background: #fff; }
        .item-card .item-name { grid-column: 1; }
        .item-card .item-price { grid-column: 2; text-align: right; padding-left: 6px; padding-right: 8px; font-variant-numeric: tabular-nums; }
        .item-card .item-remove { grid-column: 3; width: 44px; height: 44px; min-height: 44px; border: 0; background: transparent; color: #8a3a32; font-size: 22px; line-height: 1; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; justify-self: end; }
        .item-card .item-remove:hover { background: #fdecea; }
        .item-card .item-remove:focus-visible { outline: 3px solid #0066ff; outline-offset: 2px; }
        .item-card .item-desc { grid-column: 1 / -1; }
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
          .studio-controls { order: 3; overflow-x: hidden; }
          .studio-controls-end { padding-bottom: calc(168px + env(safe-area-inset-bottom)); }
          .studio-heading, .studio-controls, .studio-preview, .studio-editor-slot { width: 100%; max-width: 100%; min-width: 0; }
          .studio-canvas { display: none !important; }
          .studio-preview { position: static; z-index: 1; background: #f4f7fb; padding: 0 16px 12px; order: 1; }
          .studio-preview-live { display: block; }
          .studio-preview-still { display: none; }
          .studio-preview:not(:has(.studio-preview-live)) .studio-preview-still { display: block; }
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
  );
}
