"use client";

import { useEffect, useId, useRef, useState } from "react";
import { normalizeHex } from "@/lib/menu-templates";

/**
 * Compact accessible color control: a swatch that opens a popover with the
 * existing native color input plus a hex field. No new dependency.
 */
export function ColorField({
  label,
  value,
  fallback,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: string | null | undefined;
  fallback: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
}) {
  const name = ariaLabel || label;
  const current = normalizeHex(value) ?? normalizeHex(fallback) ?? "#000000";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => { setDraft(current); }, [current]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function commit(raw: string) {
    const next = normalizeHex(raw);
    if (next) {
      setDraft(next);
      onChange(next);
    } else {
      setDraft(raw);
    }
  }

  return (
    <div className="color-field" ref={root} data-testid="color-field">
      <span className="color-field-label">{label}</span>
      <button
        type="button"
        className="color-swatch"
        aria-label={name}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="color-swatch-chip" style={{ background: current }} aria-hidden />
        <span className="color-swatch-hex">{current}</span>
      </button>
      {open ? (
        <div id={panelId} role="dialog" aria-label={`${name} picker`} className="color-popover">
          <label className="color-popover-row">
            <input
              type="color"
              aria-label={`${name} picker`}
              value={current}
              onChange={(event) => commit(event.target.value)}
            />
            <input
              className="field"
              aria-label={`${name} hex`}
              value={draft}
              maxLength={7}
              spellCheck={false}
              onChange={(event) => commit(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      <style>{`
        .color-field { position: relative; display: grid; gap: 4px; margin: 10px 0; font-size: 14px; }
        .color-field-label { font-weight: 650; }
        .color-swatch { display: flex; align-items: center; gap: 10px; min-height: 44px; width: 100%;
          border: 1px solid #ddd4c6; border-radius: 10px; background: #fff; padding: 4px 10px 4px 6px;
          font: inherit; cursor: pointer; text-align: left; color: #1a1614; }
        .color-swatch:hover { border-color: #c8bdae; }
        .color-swatch:focus-visible { outline: 3px solid #0066ff; outline-offset: 2px; }
        .color-swatch[aria-expanded="true"] { border-color: #0066ff; box-shadow: 0 0 0 3px rgba(0,102,255,.15); }
        .color-swatch-chip { width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(11,18,32,.16); flex: 0 0 auto; }
        .color-swatch-hex { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; letter-spacing: 0.02em; }
        .color-popover { position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; right: 0;
          background: #fff; border: 1px solid #ddd4c6; border-radius: 12px; padding: 10px;
          box-shadow: 0 8px 24px rgba(11,18,32,.12); }
        .color-popover-row { display: flex; align-items: center; gap: 8px; }
        .color-popover-row input[type="color"] { width: 44px; height: 44px; min-height: 44px; padding: 2px; border: 1px solid #ddd4c6; border-radius: 8px; background: #fff; cursor: pointer; }
        .color-popover-row .field { flex: 1; min-height: 44px; }
      `}</style>
    </div>
  );
}
