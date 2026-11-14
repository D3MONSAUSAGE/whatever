"use client";
import { useMemo, useState } from "react";
import { api, type DisplayItem } from "@/lib/api";
import { publishSavedCopyForTargets } from "@/lib/screen-actions-ui";
import { screenChoices, screensToAssign } from "@/lib/show-on-screens";

/**
 * E2: after Publish, an optional "Show on which screen?" step.
 * Uses the existing assignment route (POST /api/layout-studio/assign) once per ticked screen.
 * Nothing changes on any screen unless the user ticks one and confirms.
 */
export function ShowOnScreens({ boardId, boardName, playlistId, displays, preview = false, onDone, onSkip }: {
  boardId: string;
  boardName: string;
  playlistId: string | null;
  displays: DisplayItem[];
  preview?: boolean;
  onDone: (message: string) => void;
  onSkip: () => void;
}) {
  const choices = useMemo(() => screenChoices(displays, playlistId), [displays, playlistId]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targets = screensToAssign(choices, picked);

  async function assign() {
    if (!targets.length || busy) return;
    if (preview) { onDone("Preview only — no screen was changed."); return; }
    setBusy(true);
    setError(null);
    const done: DisplayItem[] = [];
    const failed: string[] = [];
    for (const id of targets) {
      try {
        await api("/api/layout-studio/assign", { method: "POST", body: JSON.stringify({ menuId: boardId, displayId: id }) });
        const display = displays.find((item) => item.id === id);
        if (display) done.push(display);
      } catch {
        failed.push(choices.find((choice) => choice.id === id)?.name ?? "a screen");
      }
    }
    setBusy(false);
    if (failed.length && !done.length) { setError(`Couldn't show it on ${failed.join(", ")}. Try again or use My Screens.`); return; }
    const copy = done.length ? publishSavedCopyForTargets(done.map((item) => ({ online: item.online, connected: item.connected }))) : "";
    onDone(failed.length ? `${copy} Couldn't show it on ${failed.join(", ")}.` : copy);
  }

  return (
    <section className="show-on-screens" role="region" aria-labelledby="show-on-screens-title" data-testid="show-on-screens">
      <h2 id="show-on-screens-title">Show on which screen?</h2>
      <p className="show-on-screens-lede">“{boardName}” is published. Optional: pick screens to show it on now, or skip and choose later in My Screens or Schedules.</p>
      {choices.length ? (
        <fieldset className="show-on-screens-list">
          <legend className="sr-only">Screens</legend>
          {choices.map((choice) => (
            <label key={choice.id} className="show-on-screens-row">
              <input type="checkbox" disabled={choice.showing || busy} checked={choice.showing || picked.includes(choice.id)}
                onChange={(event) => setPicked(event.target.checked ? [...picked, choice.id] : picked.filter((id) => id !== choice.id))} />
              <span className="show-on-screens-name">{choice.name}</span>
              <span className="show-on-screens-status">{choice.showing ? "Already showing this board" : choice.status}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="show-on-screens-lede">No paired screens yet. Add a screen in My Screens, then assign this board there.</p>
      )}
      {error ? <p className="show-on-screens-error" role="alert">{error}</p> : null}
      <div className="show-on-screens-actions">
        <button type="button" className="btn btn-quiet min-h-11" disabled={busy} onClick={onSkip}>Not now</button>
        {choices.length ? (
          <button type="button" className="btn btn-primary min-h-11" disabled={!targets.length || busy} onClick={() => { void assign(); }}>
            {busy ? "Showing…" : targets.length > 1 ? `Show on ${targets.length} screens` : "Show on this screen"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
