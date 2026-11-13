"use client";

import type { DisplayItem } from "@/lib/api";
import { assignedContentPreview, assignedKindLabel } from "@/lib/assigned-content";

/** Small 16:9 assigned-content preview. Never presented as a live TV image. */
export function AssignedThumb({ display, size = "card" }: { display: DisplayItem; size?: "card" | "large" }) {
  const preview = assignedContentPreview(display);
  const wide = size === "large";
  return (
    <figure
      className={`assigned-thumb ${wide ? "assigned-thumb-lg" : ""}`}
      data-testid="assigned-thumb"
      data-kind={preview.kind}
    >
      <div className="assigned-thumb-frame" aria-hidden={!preview.src}>
        {preview.src ? (
          <img src={preview.src} alt="" loading="lazy" decoding="async" className="assigned-thumb-img" />
        ) : (
          <span className="assigned-thumb-fallback">
            <span className="assigned-thumb-icon">{iconFor(preview.kind)}</span>
            <span className="assigned-thumb-kind">{assignedKindLabel(preview.kind)}</span>
          </span>
        )}
      </div>
      <figcaption className="assigned-thumb-caption">
        {preview.kind !== "empty" ? <span className="assigned-thumb-label">{preview.label}</span> : null}
        <span className="assigned-thumb-sr sr-only">{assignedKindLabel(preview.kind)}{preview.name ? `: ${preview.name}` : ""}</span>
      </figcaption>
      <style>{`
        .assigned-thumb { margin: 0; flex: 0 0 auto; width: 128px; min-width: 112px; }
        .assigned-thumb-lg { width: 100%; min-width: 0; }
        .assigned-thumb-frame { aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; background: #1a1614; border: 1px solid rgba(11,18,32,.08); display: grid; place-items: center; }
        .assigned-thumb-img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .assigned-thumb-fallback { display: grid; place-items: center; gap: 2px; color: #f3ecdf; text-align: center; padding: 4px; }
        .assigned-thumb-icon { font-size: 16px; line-height: 1; }
        .assigned-thumb-kind { font-size: 10px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; opacity: .85; }
        .assigned-thumb-caption { display: flex; justify-content: flex-end; margin-top: 4px; }
        .assigned-thumb-label { font-size: 10px; font-weight: 650; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-muted, #5c534c); }
        @media (max-width: 639px) {
          .assigned-thumb { width: 96px; min-width: 96px; }
        }
      `}</style>
    </figure>
  );
}

function iconFor(kind: string): string {
  if (kind === "video") return "▶";
  if (kind === "menu-board") return "☰";
  if (kind === "playlist") return "▤";
  if (kind === "presentation") return "▣";
  if (kind === "image") return "▣";
  return "TV";
}
