"use client";
import { createContext, createElement, useContext, useEffect, useSyncExternalStore } from "react";
import { PEEK_COOKIE, PEEK_THEME_COOKIE, peekBuildAllowed, peekDefaultOn, peekOptedIn, peekResolvedTheme, peekThemeChoice } from "@/lib/peek-gate";

export { peekExcludedPath } from "@/lib/peek-gate";

/** Peek redesign preview flag. See lib/peek-gate.ts for the rules. */
const listeners = new Set<() => void>();
function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function snapshot(): boolean {
  if (!peekBuildAllowed() || typeof document === "undefined") return false;
  return peekOptedIn(document.cookie, new URLSearchParams(location.search).get("peek"), peekDefaultOn());
}

/**
 * What the server decided for this request (cookie + build default), provided by <PeekServer> (components/peek/server.tsx)
 * on the sign-in pages and the dashboard only. Everywhere else (marketing, /pair, /tv, /player) it stays false, so those
 * pages are server-rendered exactly as before.
 */
const PeekServerContext = createContext(false);
export function PeekServerProvider({ on, children }: { on: boolean; children: React.ReactNode }) {
  return createElement(PeekServerContext.Provider, { value: on }, children);
}

/** True when the Peek UI should render in this browser. Server render uses the server's cookie-based answer (false outside <PeekServer>). */
export function usePeekWeb(): boolean {
  const serverOn = useContext(PeekServerContext);
  const on = useSyncExternalStore(subscribe, snapshot, () => serverOn);
  useEffect(() => {
    if (!peekBuildAllowed()) return;
    const q = new URLSearchParams(location.search).get("peek");
    if (q !== "1" && q !== "0") return;
    const secure = location.protocol === "https:" ? "; Secure" : "";
    // ?peek=0 stores an explicit opt-out, so it also works where Peek is on by default (Production).
    document.cookie = `${PEEK_COOKIE}=${q}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`;
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
