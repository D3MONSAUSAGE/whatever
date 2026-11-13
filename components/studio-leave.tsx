"use client";

import Link, { type LinkProps } from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { confirmDiscardUnsaved } from "@/lib/menu-board-unify";

type Guard = () => boolean;

const StudioLeaveContext = createContext<{
  register: (guard: Guard) => () => void;
  allowLeave: () => boolean;
} | null>(null);

/** Lets a mounted studio editor register a dirty check that shell and Brand Kit links consult. */
export function StudioLeaveProvider({ children }: { children: ReactNode }) {
  const guards = useRef(new Set<Guard>());
  const register = useCallback((guard: Guard) => {
    guards.current.add(guard);
    return () => { guards.current.delete(guard); };
  }, []);
  const allowLeave = useCallback(() => {
    for (const guard of guards.current) {
      if (!guard()) return false;
    }
    return true;
  }, []);
  return (
    <StudioLeaveContext.Provider value={{ register, allowLeave }}>
      {children}
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
    return ctx.register(() => confirmDiscardUnsaved(dirtyRef.current()));
  }, [ctx]);
}

export function useStudioAllowLeave(): () => boolean {
  const ctx = useContext(StudioLeaveContext);
  return ctx?.allowLeave ?? (() => true);
}

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

/** Next.js Link that prompts through confirmDiscardUnsaved when a studio is dirty. Modified-clicks (new tab) are left alone. */
export function StudioGuardedLink({
  onClick,
  children,
  ...props
}: LinkProps & { href: string; className?: string; "aria-label"?: string; "aria-current"?: "page" | undefined; style?: CSSProperties; children?: ReactNode }) {
  const allowLeave = useStudioAllowLeave();
  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || isModifiedClick(event)) return;
        if (!allowLeave()) event.preventDefault();
      }}
    >
      {children}
    </Link>
  );
}
