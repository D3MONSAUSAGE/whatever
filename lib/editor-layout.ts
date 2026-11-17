"use client";
import { useEffect, useState } from "react";

/**
 * Menu-board editor layout (redesign phase 3): tools · TV canvas · properties on tablets and desktops, and
 * Content / Style / Layout tabs on phones. This is the default for every board.
 *
 * Rollback, without code changes to the editor:
 *  - everyone: set NEXT_PUBLIC_EDITOR_LAYOUT=classic in the deployment environment and redeploy;
 *  - one browser (support): open the editor with ?editor=classic (remembered; ?editor=v2 undoes it).
 * The layout changes placement and labels only: saving, publishing, preview and the unsaved-changes guard are the
 * same code in both layouts.
 */
export const EDITOR_LAYOUT_KEY = "pekko_editor_layout_override";
export type EditorLayout = "classic" | "v2";

export function parseEditorLayout(value: string | null | undefined): EditorLayout | null {
  return value === "v2" || value === "classic" ? value : null;
}

/** Deployment default: the new layout unless the environment rolls it back. */
export function defaultEditorLayout(env: string | undefined = process.env.NEXT_PUBLIC_EDITOR_LAYOUT): EditorLayout {
  return env === "classic" ? "classic" : "v2";
}

/** An explicit ?editor= wins and is remembered; otherwise a remembered override; otherwise the deployment default. */
export function resolveEditorLayout(search: string, stored: string | null, fallback: EditorLayout = defaultEditorLayout()): EditorLayout {
  const fromUrl = parseEditorLayout(new URLSearchParams(search).get("editor"));
  return fromUrl ?? parseEditorLayout(stored) ?? fallback;
}

function readStored(): string | null {
  try { return localStorage.getItem(EDITOR_LAYOUT_KEY); } catch { return null; }
}
function writeStored(value: EditorLayout) {
  try { localStorage.setItem(EDITOR_LAYOUT_KEY, value); } catch { /* private window: the choice lasts for this page */ }
}

/** [enabled]. Starts at the deployment default (same on server and client), then applies a per-browser override. */
export function useEditorV2(): [boolean] {
  const [on, setOn] = useState(defaultEditorLayout() === "v2");
  useEffect(() => {
    const fromUrl = parseEditorLayout(new URLSearchParams(window.location.search).get("editor"));
    if (fromUrl) writeStored(fromUrl);
    setOn(resolveEditorLayout(window.location.search, readStored()) === "v2");
  }, []);
  return [on];
}
