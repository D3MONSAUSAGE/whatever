"use client";
import { useEffect } from "react";
import { reloadOnceOnChunkErrorInBrowser } from "@/lib/chunk-reload";

/** R14-01: dashboard-only listener; reloads once per build when a JS/CSS chunk fails to load after a deploy. */
export function ChunkReloadGuard() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => { reloadOnceOnChunkErrorInBrowser(e.error ?? e.message); };
    const onRejection = (e: PromiseRejectionEvent) => { reloadOnceOnChunkErrorInBrowser(e.reason); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
