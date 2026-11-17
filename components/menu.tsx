"use client";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { StudioGuardedLink } from "@/components/studio-leave";
import { IconMore } from "@/components/icons";

export type MenuItem =
  | { kind?: "link"; href: string; label: string; icon?: ReactNode; danger?: boolean }
  | { kind: "action"; onSelect: () => void; label: string; icon?: ReactNode; danger?: boolean };

/**
 * "⋯" overflow menu (design system, phase 2). A button with aria-haspopup="menu" opens a list of menuitems:
 * ↑/↓/Home/End move, Escape closes and returns focus, Tab or a click outside closes. Links go through
 * StudioGuardedLink so unsaved editor changes are still protected.
 */
export function OverflowMenu({ label, items, className = "", testId }: { label: string; items: MenuItem[]; className?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback((refocus = true) => { setOpen(false); if (refocus) button.current?.focus(); }, []);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) close(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

  function onKeyDown(e: React.KeyboardEvent) {
    const list = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") close(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); list[list.length - 1]?.focus(); }
  }

  return (
    <div className={`relative ${className}`} ref={wrap}>
      <button ref={button} type="button" className="ps-more-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} data-testid={testId} onClick={() => (open ? close() : setOpen(true))}>
        <IconMore />
      </button>
      {open ? (
        <div id={id} ref={menu} role="menu" aria-label={label} className="ps-menu" onKeyDown={onKeyDown}>
          {items.map((item) =>
            item.kind === "action" ? (
              <button key={item.label} type="button" role="menuitem" tabIndex={-1} className={`ps-menu-item${item.danger ? " is-danger" : ""}`} onClick={() => { setOpen(false); item.onSelect(); }}>
                {item.icon}{item.label}
              </button>
            ) : (
              <StudioGuardedLink key={item.label} href={item.href} role="menuitem" tabIndex={-1} className={`ps-menu-item${item.danger ? " is-danger" : ""}`} onClick={() => setOpen(false)}>
                {item.icon}{item.label}
              </StudioGuardedLink>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
