"use client";
/**
 * Peek redesign shared primitives (handoff 03-COMPONENTS.md). Presentation only: every primitive takes the
 * existing labels and callbacks from the page that uses it, so no copy, API call or confirmation changes.
 * They render only inside the Peek preview (body.peek), see lib/peek-gate.ts.
 */
import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconMore, IconPlus, IconWarn, IconInfo, IconCheck } from "@/components/icons";

type Mood = "open" | "happy" | "asleep";

/** Peek, always decorative (aria-hidden) and never a replacement for a text label. */
export function Peek({ mood = "open", size = 48, outline = true }: { mood?: Mood; size?: number; outline?: boolean }) {
  const eyes = mood === "open"
    ? <><ellipse cx="25.5" cy="35" rx="4.2" ry="6" fill="#251A3A" /><ellipse cx="41.5" cy="35" rx="4.2" ry="6" fill="#251A3A" /></>
    : <path d={mood === "happy" ? "M19 37Q24 31 29 37M35 37Q40 31 45 37" : "M19 36Q24 40 29 36M35 36Q40 40 45 36"} stroke="#251A3A" strokeWidth="3" fill="none" strokeLinecap="round" />;
  return (
    <svg className="pk-peek" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" data-mood={mood}>
      <rect x="6" y="14" width="52" height="40" rx="14" fill="#FFC53D" stroke={outline ? "#251A3A" : "none"} strokeWidth="1.5" />
      <rect x="25" y="55" width="14" height="5" rx="2.5" fill="#FFC53D" />
      {eyes}
    </svg>
  );
}

export type ButtonVariant = "primary" | "accent" | "tint" | "line" | "quiet" | "danger" | "danger-line";
type ButtonSize = "default" | "compact";
export function btnClass(variant: ButtonVariant = "primary", size: ButtonSize = "default", extra = ""): string {
  return `pk-btn pk-btn-${variant}${size === "compact" ? " pk-btn-compact" : ""}${extra ? ` ${extra}` : ""}`;
}

/** Disabled keeps aria-disabled and still blocks the click. Busy keeps the label slot (pass the existing busy label). */
export function PeekButton({ variant = "primary", size = "default", disabled, busy, busyLabel, children, className = "", onClick, type = "button", ...rest }:
  { variant?: ButtonVariant; size?: ButtonSize; disabled?: boolean; busy?: boolean; busyLabel?: string; children: ReactNode; className?: string; onClick?: () => void; type?: "button" | "submit" } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "disabled">) {
  const blocked = Boolean(disabled || busy);
  return (
    <button {...rest} type={type} className={btnClass(variant, size, className)} aria-disabled={blocked || undefined} aria-busy={busy || undefined}
      onClick={(e) => { if (blocked) { e.preventDefault(); return; } onClick?.(); }}>
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

export function PeekLinkButton({ href, variant = "primary", size = "default", className = "", children, ...rest }: { href: string; variant?: ButtonVariant; size?: ButtonSize; className?: string; children: ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return <Link href={href} className={btnClass(variant, size, className)} {...rest}>{children}</Link>;
}

export function PeekCard({ children, className = "", as: As = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "article" | "div" } & React.HTMLAttributes<HTMLElement>) {
  return <As className={`pk-card ${className}`} {...rest}>{children}</As>;
}

export type PillVariant = "live" | "asleep" | "wait" | "neutral" | "bad";
/** Dot + text label, never colour alone. */
export function StatusPill({ variant, children }: { variant: PillVariant; children: ReactNode }) {
  return <span className={`pk-pill pk-pill-${variant}`} data-variant={variant}><span className="pk-pill-dot" aria-hidden="true" />{children}</span>;
}

/** Filters use aria-pressed (role="tablist" views should use Tabs). Counts sit inline in the label. */
export function SegmentedFilter<T extends string>({ label, options, value, onChange, fill = false }: { label: string; options: { id: T; label: string }[]; value: T; onChange: (id: T) => void; fill?: boolean }) {
  return (
    <div className={`pk-seg${fill ? " pk-seg-fill" : ""}`} role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}

export function PeekField({ label, help, error, children }: { label: string; help?: string; error?: string | null; children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode }) {
  const id = useId();
  const helpId = `${id}-help`;
  const errId = `${id}-err`;
  const describedBy = [error ? errId : null, help ? helpId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="pk-field">
      <label htmlFor={id} className="pk-field-label">{label}</label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {help ? <span id={helpId} className="pk-field-help">{help}</span> : null}
      {error ? <span id={errId} className="pk-field-error" role="alert">{error}</span> : null}
    </div>
  );
}

/** One real input (inputmode numeric, one-time-code, maxlength 6) drawn as 6 boxes. Paste "483 920" works. */
export function CodeInput({ value, onChange, label, invalid = false, describedBy, id, autoFocus, required, inputProps }: { value: string; onChange: (v: string) => void; label: string; invalid?: boolean; describedBy?: string; id?: string; autoFocus?: boolean; required?: boolean; inputProps?: Pick<React.InputHTMLAttributes<HTMLInputElement>, "onInvalid" | "onInput"> }) {
  const [focused, setFocused] = useState(false);
  const digits = value.replace(/\D/g, "").slice(0, 6);
  return (
    <div className="pk-code" data-invalid={invalid || undefined}>
      <input {...inputProps} id={id} required={required} className="pk-code-input" aria-label={label} inputMode="numeric" autoComplete="one-time-code" maxLength={7} pattern="[0-9 ]*"
        value={digits} aria-invalid={invalid || undefined} aria-describedby={describedBy} autoFocus={autoFocus}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))} />
      <div className="pk-code-boxes" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`pk-code-box${digits[i] ? " is-filled" : ""}${focused && i === Math.min(digits.length, 5) ? " is-active" : ""}`}>{digits[i] ?? ""}</span>
        ))}
      </div>
    </div>
  );
}

export type BannerVariant = "warn" | "err" | "ok" | "info" | "asleep";
export function PeekBanner({ variant, lead, children, action, peek, role }: { variant: BannerVariant; lead?: ReactNode; children?: ReactNode; action?: ReactNode; peek?: Mood; role?: "status" | "alert" }) {
  const icon = peek ? <Peek mood={peek} size={32} outline={false} /> : variant === "warn" || variant === "err" ? <IconWarn /> : variant === "ok" ? <IconCheck /> : <IconInfo />;
  return (
    <div className={`pk-banner pk-banner-${variant}`} role={role}>
      <span className="pk-banner-icon">{icon}</span>
      <p className="pk-banner-text">{lead ? <strong>{lead}</strong> : null}{children}</p>
      {action}
    </div>
  );
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

function trapTab(e: React.KeyboardEvent, root: HTMLElement | null) {
  if (e.key !== "Tab" || !root) return;
  const f = Array.from(root.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])"));
  if (!f.length) return;
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
}

/**
 * Centered dialog on desktop, bottom sheet with pinned actions on phones. Destructive confirmations pass
 * `destructive`: role="alertdialog" and focus starts on the first action (Cancel, which callers put first).
 */
export function PeekDialog({ open, title, children, actions, onClose, destructive = false }: { open: boolean; title: string; children?: ReactNode; actions: ReactNode; onClose: () => void; destructive?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useEscape(open, onClose);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    (ref.current?.querySelector<HTMLElement>(".pk-dialog-actions button, .pk-dialog-actions a") ?? ref.current)?.focus();
    return () => prev?.focus?.();
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="pk-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="pk-dialog" role={destructive ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby={titleId} aria-describedby={children ? bodyId : undefined} tabIndex={-1} onKeyDown={(e) => trapTab(e, ref.current)}>
        <h2 id={titleId} className="pk-dialog-title">{title}</h2>
        {children ? <div id={bodyId} className="pk-dialog-body">{children}</div> : null}
        <div className="pk-dialog-actions">{actions}</div>
      </div>
    </div>,
    document.body,
  );
}

export function BottomSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEscape(open, onClose);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("a, button")?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="pk-sheet-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="pk-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={(e) => trapTab(e, ref.current)}>
        <h2 id={titleId} className="pk-sheet-title">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export type OverflowItem = { id: string; label: string; icon?: ReactNode; danger?: boolean; href?: string; onSelect?: () => void };

function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return phone;
}

/** ⋯ menu: a dropdown (role="menu") on desktop, a bottom sheet on phones. Destructive items go last. */
export function OverflowMenu({ label, items, sheetTitle }: { label: string; items: OverflowItem[]; sheetTitle?: string }) {
  const [open, setOpen] = useState(false);
  const phone = usePhone();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const ordered = [...items.filter((i) => !i.danger), ...items.filter((i) => i.danger)];
  const close = useCallback((refocus = true) => { setOpen(false); if (refocus) button.current?.focus(); }, []);
  useEffect(() => {
    if (!open || phone) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onDoc = (e: MouseEvent) => { if (!menu.current?.parentElement?.contains(e.target as Node)) close(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, phone, close]);
  const choose = (item: OverflowItem) => { close(!item.href); item.onSelect?.(); };
  const render = (item: OverflowItem, role?: "menuitem") => item.href
    ? <Link key={item.id} href={item.href} role={role} tabIndex={role ? -1 : undefined} className={`pk-menu-item${item.danger ? " is-danger" : ""}`} onClick={() => choose(item)}>{item.icon}{item.label}</Link>
    : <button key={item.id} type="button" role={role} tabIndex={role ? -1 : undefined} className={`pk-menu-item${item.danger ? " is-danger" : ""}`} onClick={() => choose(item)}>{item.icon}{item.label}</button>;
  const onKeyDown = (e: React.KeyboardEvent) => {
    const els = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") close(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
  };
  return (
    <div className="relative">
      <button ref={button} type="button" className="pk-icon-btn" aria-label={label} aria-haspopup={phone ? "dialog" : "menu"} aria-expanded={open} aria-controls={open && !phone ? menuId : undefined} onClick={() => (open ? close() : setOpen(true))}>
        <IconMore />
      </button>
      {open && !phone ? (
        <div ref={menu} id={menuId} role="menu" aria-label={label} className="pk-menu" onKeyDown={onKeyDown}>
          {ordered.map((item, i) => (
            <div key={item.id} role="none">
              {item.danger && i > 0 && !ordered[i - 1].danger ? <div className="pk-menu-sep" role="separator" /> : null}
              {render(item, "menuitem")}
            </div>
          ))}
        </div>
      ) : null}
      <BottomSheet open={open && phone} title={sheetTitle ?? label} onClose={() => close()}>
        {ordered.map((item) => render(item))}
      </BottomSheet>
    </div>
  );
}

/** Visual for a toast (the live toasts keep using components/toast.tsx, restyled by the .peek scope). */
export function PeekToast({ error = false, children }: { error?: boolean; children: ReactNode }) {
  return (
    <div className="pk-toast" role={error ? "alert" : "status"}>
      <span className={`pk-toast-icon ${error ? "is-bad" : "is-ok"}`} aria-hidden="true">{error ? "!" : "✓"}</span>
      <span>{children}</span>
    </div>
  );
}

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={`pk-skel ${className}`} style={style} aria-hidden="true" />;
}
/** Wraps skeleton blocks with the screen-reader "Loading…" text (pass the existing common.loading copy). */
export function SkeletonRegion({ label, children }: { label: string; children: ReactNode }) {
  return <div role="status" aria-live="polite"><span className="pk-sr-only">{label}</span>{children}</div>;
}

export function EmptyState({ title, body, action, mood = "open" }: { title: string; body?: ReactNode; action?: ReactNode; mood?: Mood }) {
  return (
    <div className="pk-empty">
      <Peek mood={mood} size={64} />
      <h2 className="pk-empty-title">{title}</h2>
      {body ? <p className="pk-empty-body">{body}</p> : null}
      {action}
    </div>
  );
}

/** Asleep Peek + the existing error text + Try again (pass the existing labels). */
export function ErrorState({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div className="pk-empty" role="alert">
      <Peek mood="asleep" size={64} />
      <p className="pk-empty-body">{message}</p>
      <PeekButton variant="tint" onClick={onRetry}>{retryLabel}</PeekButton>
    </div>
  );
}

/** TV preview bezel. The screen keeps the board's own aspect (16:9 or 9:16), object-fit contain, never stretched. */
export function TvBezel({ src, alt, portrait = false, children, className = "" }: { src?: string | null; alt?: string; portrait?: boolean; children?: ReactNode; className?: string }) {
  return (
    <div className={`pk-bezel ${className}`}>
      <div className={`pk-bezel-screen${portrait ? " is-portrait" : ""}`}>
        {src ? <img src={src} alt={alt ?? ""} /> : children}
      </div>
    </div>
  );
}

/** Phone-only floating add button. Always labelled; hidden while a sheet or dialog is open (CSS). */
export function Fab({ href, onClick, label }: { href?: string; onClick?: () => void; label: string }) {
  return href
    ? <Link href={href} className="pk-fab" aria-label={label}><IconPlus /></Link>
    : <button type="button" className="pk-fab" aria-label={label} onClick={onClick}><IconPlus /></button>;
}

/** Fixed Save draft / Publish bar. Replaces the tab bar on phones. */
export function ActionBar({ help, children }: { help?: ReactNode; children: ReactNode }) {
  return <div className="pk-actionbar">{help ? <p className="pk-actionbar-help">{help}</p> : null}{children}</div>;
}

/** Schedules switch: role="switch" + aria-checked + an aria-label naming the schedule. */
export function PeekSwitch({ checked, label, onChange, disabled }: { checked: boolean; label: string; onChange: (next: boolean) => void; disabled?: boolean }) {
  return <button type="button" role="switch" className="pk-switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} />;
}
