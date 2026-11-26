"use client";
import { useEffect, useSyncExternalStore } from "react";
import { PEEK_COOKIE, PEEK_THEME_COOKIE, peekBuildAllowed, peekOptedIn, peekResolvedTheme, peekThemeChoice } from "@/lib/peek-gate";

export { peekExcludedPath } from "@/lib/peek-gate";

/** Peek redesign preview flag. See lib/peek-gate.ts for the rules. */
const listeners = new Set<() => void>();
function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function snapshot(): boolean {
  if (!peekBuildAllowed() || typeof document === "undefined") return false;
  return peekOptedIn(document.cookie, new URLSearchParams(location.search).get("peek"));
}

/** True when the Peek UI should render in this browser. Server render (and production builds) always return false. */
export function usePeekWeb(): boolean {
  const on = useSyncExternalStore(subscribe, snapshot, () => false);
  useEffect(() => {
    if (!peekBuildAllowed()) return;
    const q = new URLSearchParams(location.search).get("peek");
    if (q !== "1" && q !== "0") return;
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = q === "1"
      ? `${PEEK_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`
      : `${PEEK_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    listeners.forEach((fn) => fn());
  }, []);
  return on;
}


/**
 * Puts `peek` and `data-theme` on <body> while `on`, so portals get the tokens. The theme is light unless this browser
 * opted in to dark with ?theme=dark|system|light (see peekThemeChoice in lib/peek-gate.ts).
 */
export function usePeekBodyClass(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const q = new URLSearchParams(location.search).get("theme");
    if (q === "dark" || q === "light" || q === "system") {
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${PEEK_THEME_COOKIE}=${q}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`;
    }
    const choice = peekThemeChoice(document.cookie, q);
    const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
    const apply = () => { document.body.dataset.theme = peekResolvedTheme(choice, !!mq?.matches); };
    document.body.classList.add("peek");
    apply();
    if (choice === "system") mq?.addEventListener("change", apply);
    return () => {
      mq?.removeEventListener("change", apply);
      document.body.classList.remove("peek");
      delete document.body.dataset.theme;
    };
  }, [on]);
}
