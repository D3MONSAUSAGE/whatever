"use client";
import { useEffect, useRef } from "react";

/**
 * Muted, looping sample clip. React does not always write the `muted` attribute during server rendering,
 * and browsers only autoplay muted video, so it is set here. With reduced motion the poster stays up.
 */
export function MutedVideo({ src, poster, className = "" }: { src: string; poster: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (reduce?.matches) { v.pause(); return; }
      v.play().catch(() => { /* autoplay refused: the poster stays visible */ });
    };
    sync();
    reduce?.addEventListener?.("change", sync);
    return () => reduce?.removeEventListener?.("change", sync);
  }, []);
  return (
    <video ref={ref} className={className} src={src} poster={poster} muted loop playsInline preload="metadata" aria-hidden="true" tabIndex={-1} />
  );
}
