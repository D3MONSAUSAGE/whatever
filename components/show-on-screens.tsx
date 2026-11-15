"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type DisplayItem } from "@/lib/api";
import { publishSavedCopyForTargets } from "@/lib/screen-actions-ui";
import { replaceNotes, screenChoices, screensToAssign } from "@/lib/show-on-screens";
import { useT } from "@/lib/i18n/client";

/**
 * E2: after Publish, an optional t("sos.title") step.
 * Uses the existing assignment route (POST /api/layout-studio/assign) once per ticked screen.
 * Nothing changes on any screen unless the user ticks one and confirms.
 */
export function ShowOnScreens({ boardId, boardName, playlistId, displays, loading = false, preview = false, assignAll, onDone, onSkip }: {
  boardId: string;
  boardName: string;
  playlistId: string | null;
  displays: DisplayItem[];
  /** Screens are still loading. */
  loading?: boolean;
  preview?: boolean;
  /**
   * E2b: classic boards assign all ticked screens in one call to the existing
   * POST /api/playlists/[id]/publish (the same publish_playlist the classic save uses).
   * Layout boards keep POST /api/layout-studio/assign per screen.
   */
  assignAll?: (displayIds: string[]) => Promise<void>;
  onDone: (message: string) => void;
  onSkip: () => void;
}) {
  const t = useT();
  const choices = useMemo(() => screenChoices(displays, playlistId, t), [displays, playlistId, t]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targets = screensToAssign(choices, picked);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Gother PR95 lows: focus the heading when the card appears; Escape acts like t("sos.notNow").
  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onSkip();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onSkip]);

  async function assign() {
    if (!targets.length || busy) return;
    if (preview) { onDone(t("sos.preview")); return; }
    setBusy(true);
    setError(null);
    const done: DisplayItem[] = [];
    const failed: string[] = [];
    if (assignAll) {
      try {
        await assignAll(targets);
        for (const id of targets) { const display = displays.find((item) => item.id === id); if (display) done.push(display); }
      } catch {
        setBusy(false);
        setError(t("sos.failed", { names: targets.map((id) => choices.find((choice) => choice.id === id)?.name ?? t("sos.aScreen")).join(", ") }));
        return;
      }
    } else for (const id of targets) {
      try {
        await api("/api/layout-studio/assign", { method: "POST", body: JSON.stringify({ menuId: boardId, displayId: id }) });
        const display = displays.find((item) => item.id === id);
        if (display) done.push(display);
      } catch {
        failed.push(choices.find((choice) => choice.id === id)?.name ?? t("sos.aScreen"));
      }
    }
    setBusy(false);
    if (failed.length && !done.length) { setError(t("sos.failed", { names: failed.join(", ") })); return; }
    const copy = done.length ? publishSavedCopyForTargets(done.map((item) => ({ online: item.online, connected: item.connected }))) : "";
    onDone(failed.length ? t("sos.partFailed", { copy, names: failed.join(", ") }) : copy);
  }

  return (
    <section className="show-on-screens" role="region" aria-labelledby="show-on-screens-title" data-testid="show-on-screens">
      <h2 id="show-on-screens-title" ref={headingRef} tabIndex={-1}>{t("sos.title")}</h2>
      <p className="show-on-screens-lede">{t("sos.lede", { name: boardName })}</p>
      {loading ? <p className="show-on-screens-lede" role="status">{t("sos.loading")}</p> : choices.length ? (
        <>
        <div className="show-on-screens-warn" aria-live="polite" data-testid="show-on-screens-warn">
          {replaceNotes(choices, picked, t).map((note) => <p key={note}>{note}</p>)}
        </div>
        <fieldset className="show-on-screens-list">
          <legend className="sr-only">{t("ed.screens")}</legend>
          {choices.map((choice) => (
            <label key={choice.id} className="show-on-screens-row">
              <input type="checkbox" disabled={choice.showing || busy} checked={choice.showing || picked.includes(choice.id)}
                onChange={(event) => setPicked(event.target.checked ? [...picked, choice.id] : picked.filter((id) => id !== choice.id))} />
              <span className="show-on-screens-name">{choice.name}</span>
              <span className="show-on-screens-status">{choice.showing ? t("sos.showing") : choice.status}</span>
              {!choice.showing && choice.nowShowing ? <span className="show-on-screens-now">{t("showOnScreens.replacesHere", { current: choice.nowShowing })}</span> : null}
            </label>
          ))}
        </fieldset>
        </>
      ) : (
        <p className="show-on-screens-lede">{t("sos.empty")} <Link href="/dashboard/screens/add#add-screen" className="underline font-semibold">{t("sos.add")}</Link>{t("sos.emptyTail")}</p>
      )}
      {error ? <p className="show-on-screens-error" role="alert">{error}</p> : null}
      <div className="show-on-screens-actions">
        <button type="button" className="btn btn-quiet min-h-11" disabled={busy} onClick={onSkip}>{t("sos.notNow")}</button>
        {!loading && choices.length ? (
          <button type="button" className="btn btn-primary min-h-11" disabled={!targets.length || busy} onClick={() => { void assign(); }}>
            {busy ? t("sos.busy") : targets.length > 1 ? t("sos.many", { count: targets.length }) : t("sos.one")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
