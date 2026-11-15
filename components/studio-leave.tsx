"use client";

import Link, { type LinkProps } from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { confirmDiscardUnsaved } from "@/lib/menu-board-unify";
import { useConfirm, type ConfirmRequest } from "@/components/confirm";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n/index";

/** A dirty check: true while the editor holds unsaved edits. */
type Guard = () => boolean;
/** Runs `proceed` straight away when nothing is unsaved; otherwise asks first and runs it only on "Discard changes". */
export type RequestLeave = (proceed: () => void) => void;

const StudioLeaveContext = createContext<{
  register: (guard: Guard) => () => void;
  requestLeave: RequestLeave;
  anyDirty: () => boolean;
  navigate: (href: string) => void;
  confirmDiscard: (unsaved: boolean, proceed: () => void) => void;
} | null>(null);

/** The leave-guard copy (I18N-1F). Matches Android's Spanish (Gother). */
export function discardRequest(t: T): ConfirmRequest {
  return {
    title: t("leaveGuard.title"),
    body: t("leaveGuard.body"),
    confirmLabel: t("leaveGuard.discard"),
    cancelLabel: t("leaveGuard.keepEditing"),
    danger: true,
  };
}

/** Outside the provider (preview harness, tests) the guard falls back to the browser confirm, still in the UI language. */
function nativeConfirm(t: T): boolean {
  if (typeof window === "undefined") return false;
  return window.confirm(`${t("leaveGuard.title")}\n\n${t("leaveGuard.body")}`);
}

/** Lets a mounted studio editor register a dirty check that shell and Brand Kit links consult. */
export function StudioLeaveProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const { ask, node } = useConfirm();
  // The router lives here (inside the app shell), so links and editors rendered outside Next's router still work.
  const router = useRouter();
  const navigate = useCallback((href: string) => router.push(href), [router]);
  const guards = useRef(new Set<Guard>());
  const register = useCallback((guard: Guard) => {
    guards.current.add(guard);
    return () => { guards.current.delete(guard); };
  }, []);
  const confirmDiscard = useCallback((unsaved: boolean, proceed: () => void) => {
    if (!unsaved) { proceed(); return; }
    void ask(discardRequest(tRef.current)).then((answer) => { if (answer === true) proceed(); });
  }, [ask]);
  const anyDirty = useCallback(() => [...guards.current].some((guard) => guard()), []);
  const requestLeave = useCallback<RequestLeave>((proceed) => confirmDiscard(anyDirty(), proceed), [confirmDiscard, anyDirty]);
  const value = useMemo(() => ({ register, requestLeave, anyDirty, navigate, confirmDiscard }), [register, requestLeave, anyDirty, navigate, confirmDiscard]);
  return (
    <StudioLeaveContext.Provider value={value}>
      {children}
      {node}
    </StudioLeaveContext.Provider>
  );
}

/** Register a dirty check for as long as the studio is mounted. No-op outside the provider. */
export function useRegisterStudioLeave(isDirty: () => boolean) {
  const ctx = useContext(StudioLeaveContext);
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;
  useEffect(() => {
    if (!ctx) return;
    return ctx.register(() => dirtyRef.current());
  }, [ctx]);
}

/** Ask before leaving any mounted editor with unsaved edits (shell links, sign out). */
export function useStudioRequestLeave(): RequestLeave {
  const ctx = useContext(StudioLeaveContext);
  return ctx?.requestLeave ?? ((proceed) => proceed());
}

/**
 * The editor's own leave/switch prompt: `confirmDiscard(unsaved, proceed)`.
 * Uses the in-app dialog under the dashboard shell, else the browser confirm (same t() copy).
 */
export function useConfirmDiscard(): (unsaved: boolean, proceed: () => void) => void {
  const ctx = useContext(StudioLeaveContext);
  const t = useT();
  if (ctx) return ctx.confirmDiscard;
  return (unsaved, proceed) => { if (confirmDiscardUnsaved(unsaved, () => nativeConfirm(t))) proceed(); };
}

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

/** Next.js Link that asks through the leave dialog when a studio is dirty. Modified-clicks (new tab) are left alone. */
export function StudioGuardedLink({
  onClick,
  children,
  target,
  ...props
}: LinkProps & { href: string; className?: string; "aria-label"?: string; "aria-current"?: "page" | undefined; style?: CSSProperties; target?: string; children?: ReactNode }) {
  const ctx = useContext(StudioLeaveContext);
  return (
    <Link
      {...props}
      target={target}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || isModifiedClick(event) || target === "_blank" || !ctx || !ctx.anyDirty()) return;
        // Hold the navigation; the dialog continues it only on "Discard changes".
        event.preventDefault();
        ctx.confirmDiscard(true, () => ctx.navigate(props.href));
      }}
    >
      {children}
    </Link>
  );
}
