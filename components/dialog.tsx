"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Shared modal (design system, phase 2). Replaces the hand-built `fixed inset-0` overlays so every dialog:
 *  - renders in a portal above the shell (one z-index layer, 60);
 *  - is role="dialog" aria-modal="true" with an accessible name;
 *  - moves focus inside on open, keeps Tab inside, closes on Escape or a click on the backdrop,
 *    and returns focus to whatever opened it;
 *  - locks page scroll while open;
 *  - becomes a bottom sheet on phones (`sheet`), or stays centred (`center`, e.g. a full preview).
 * The content and its buttons are the caller's, unchanged.
 */
export function Dialog({
  label,
  labelledBy,
  onClose,
  children,
  className = "",
  variant = "sheet",
  tone = "default",
  testId,
}: {
  label?: string;
  labelledBy?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  variant?: "sheet" | "center";
  tone?: "default" | "dark";
  testId?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Captured on the first render, before an autoFocus field inside the dialog takes focus.
  const openerRef = useRef<HTMLElement | null>(typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null));

  useEffect(() => {
    const opener = openerRef.current;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = panel.current;
    const first = node?.querySelector<HTMLElement>("[data-autofocus], input:not([type=hidden]):not([disabled]), select, textarea, button:not([disabled]), a[href], [tabindex='0']");
    (first ?? node)?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.stopPropagation(); close.current(); return; }
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']"));
      if (!items.length) return;
      const a = items[0], z = items[items.length - 1];
      if (event.shiftKey && document.activeElement === a) { event.preventDefault(); z.focus(); }
      else if (!event.shiftKey && document.activeElement === z) { event.preventDefault(); a.focus(); }
      else if (!node.contains(document.activeElement)) { event.preventDefault(); a.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`ps-dialog-backdrop${variant === "center" ? " is-center" : ""}${tone === "dark" ? " is-dark" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close.current(); }}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`ps-dialog ${className}`}
        data-testid={testId}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
