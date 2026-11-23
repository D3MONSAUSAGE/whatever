"use client";
import { useState } from "react";
import { api, type DisplayItem } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import type { BoardOrientation } from "@/lib/board-orientation";

/**
 * How the TV is mounted (t413u). This is a label Pekko uses for mismatch warnings only: it never rotates the TV,
 * never changes what plays, and never blocks publishing.
 */
export function viewportMismatch(display: Pick<DisplayItem, "orientation" | "reportedViewport">): "stillHorizontal" | "stillVertical" | null {
  const view = display.reportedViewport;
  if (!view || !(view.width > 0) || !(view.height > 0)) return null;
  const portraitView = view.height > view.width;
  if (display.orientation === "portrait" && !portraitView) return "stillHorizontal";
  if (display.orientation !== "portrait" && portraitView) return "stillVertical";
  return null;
}

export function OrientationChoice({ value, onChange, disabled, name }: {
  value: BoardOrientation; onChange: (value: BoardOrientation) => void; disabled?: boolean; name: string;
}) {
  const t = useT();
  return (
    <fieldset className="grid gap-2" data-testid={`${name}-orientation`}>
      <legend className="text-sm font-semibold mb-1">{t("scr.orientation")}</legend>
      <div className="flex flex-wrap gap-2">
        {(["landscape", "portrait"] as const).map((option) => (
          <label key={option} className={`flex items-center gap-2 rounded-xl border px-3 min-h-11 cursor-pointer ${value === option ? "border-ink font-semibold" : "border-line"}`}>
            <input type="radio" className="size-4" name={name} value={option} checked={value === option} disabled={disabled}
              onChange={() => onChange(option)} data-testid={`${name}-orientation-${option}`} />
            <span aria-hidden className="inline-block border-2 border-current rounded-sm opacity-70"
              style={option === "portrait" ? { width: 11, height: 18 } : { width: 20, height: 12 }} />
            {t(option === "portrait" ? "scr.orientationVertical" : "scr.orientationHorizontal")}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">{t("scr.orientationHelp")}</p>
    </fieldset>
  );
}

export function ScreenOrientation({ display, onChanged, onMessage, preview = false }: {
  display: DisplayItem; onChanged: () => void; onMessage: (text: string, error?: boolean) => void; preview?: boolean;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const current: BoardOrientation = display.orientation === "portrait" ? "portrait" : "landscape";
  const mismatch = viewportMismatch(display);
  async function save(next: BoardOrientation) {
    if (next === current || preview) return;
    setBusy(true);
    try {
      await api(`/api/displays/${display.id}`, { method: "PATCH", body: JSON.stringify({ orientation: next }) });
      onMessage(t("scr.orientationSaved"));
      onChanged();
    } catch (err) {
      onMessage((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 border-t border-line pt-4 grid gap-2" data-testid="screen-orientation">
      <OrientationChoice name={`screen-${display.id}`} value={current} onChange={(next) => { void save(next); }} disabled={busy} />
      {mismatch && display.reportedViewport ? (
        <p className="note-warn text-sm" role="status" data-testid="screen-viewport-mismatch">
          {t(mismatch === "stillHorizontal" ? "scr.viewportStillHorizontal" : "scr.viewportStillVertical", { w: display.reportedViewport.width, h: display.reportedViewport.height })}
        </p>
      ) : null}
    </div>
  );
}
