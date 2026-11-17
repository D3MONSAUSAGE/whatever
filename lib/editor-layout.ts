"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * Feature flag for the redesigned menu-board editor layout (redesign phase 3): tools · TV canvas · properties.
 * Off by default. It is an opt-in remembered in this browser, so nothing changes for anyone until they choose it
 * (from the editor toolbar, or by opening the editor with ?editor=v2; ?editor=classic switches back).
 * It changes layout and labels only: saving, publishing, preview and the unsaved-changes guard are the same code.
 */
export const EDITOR_LAYOUT_KEY = "pekko_editor_layout";
export type EditorLayout = "classic" | "v2";

export function parseEditorLayout(value: string | null | undefined): EditorLayout | null {
  return value === "v2" || value === "classic" ? value : null;
}

/** The layout to use: an explicit ?editor= wins and is remembered; otherwise the stored choice; default classic. */
export function resolveEditorLayout(search: string, stored: string | null): EditorLayout {
  const fromUrl = parseEditorLayout(new URLSearchParams(search).get("editor"));
  return fromUrl ?? parseEditorLayout(stored) ?? "classic";
}

function readStored(): string | null {
  try { return localStorage.getItem(EDITOR_LAYOUT_KEY); } catch { return null; }
}
function writeStored(value: EditorLayout) {
  try { localStorage.setItem(EDITOR_LAYOUT_KEY, value); } catch { /* private window: the choice lasts for this page */ }
}

/** [enabled, setEnabled]. Starts false on the server and the first render, so markup always hydrates cleanly. */
export function useEditorV2(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const layout = resolveEditorLayout(window.location.search, readStored());
    if (parseEditorLayout(new URLSearchParams(window.location.search).get("editor"))) writeStored(layout);
    setOn(layout === "v2");
  }, []);
  const set = useCallback((next: boolean) => {
    writeStored(next ? "v2" : "classic");
    setOn(next);
  }, []);
  return [on, set];
}
