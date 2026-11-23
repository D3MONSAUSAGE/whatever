"use client";

import { useEffect, useState } from "react";
import { boxStyle, type VideoPreview } from "@/lib/board-preview";
import type { ZoneBox } from "@/lib/layout-studio";

/**
 * Muted looping video for a layout zone, with a still or labeled poster underneath
 * so the area is never a blank panel. Used by Layout Studio and the Menu Builder.
 */
export function ZoneVideo({
  box,
  src,
  poster,
  fileName,
  units = "percent",
  label,
  fallbackLabel = "Video",
  canvas,
}: {
  box: ZoneBox;
  src: string | null;
  poster: string | null;
  fileName?: string;
  units?: "px" | "percent";
  /** Accessible name for the fallback poster (e.g. "Video poster: promo.mp4"). */
  label?: string;
  fallbackLabel?: string;
  /** Board canvas the box is in (1920×1080 unless the board is vertical). */
  canvas?: { width: number; height: number };
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  const style = boxStyle(box, units, canvas);
  const play = Boolean(src) && !failed;
  const caption = (fileName ?? "").trim();
  return (
    <>
      {poster ? (
        <img src={poster} alt="" style={{ ...style, zIndex: 1, background: "#111" }} />
      ) : (
        <div
          data-testid="zone-video-placeholder"
          role="img"
          aria-label={label || caption || fallbackLabel}
          style={{
            ...style,
            zIndex: 1,
            display: "grid",
            placeItems: "center",
            background: "rgba(11, 18, 32, 0.82)",
            color: "#fff",
            fontSize: units === "px" ? 28 : "1rem",
            fontWeight: 700,
            letterSpacing: "0.02em",
            textAlign: "center",
            padding: 12,
            objectFit: undefined,
          }}
        >
          <span style={{ maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis" }}>{caption || fallbackLabel}</span>
        </div>
      )}
      {play ? (
        <video
          src={src ?? undefined}
          poster={poster ?? undefined}
          muted
          autoPlay
          loop
          playsInline
          {...{ "webkit-playsinline": "webkit-playsinline" }}
          onError={() => setFailed(true)}
          data-testid="zone-video"
          style={{ ...style, zIndex: 2, background: "transparent" }}
        />
      ) : null}
    </>
  );
}

export function zoneFromPreview(preview: VideoPreview): {
  box: ZoneBox;
  src: string | null;
  poster: string | null;
  fileName: string;
} {
  return { box: preview.box, src: preview.src, poster: preview.poster, fileName: preview.fileName };
}
