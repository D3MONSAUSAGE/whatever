"use client";
import { useCallback, useContext, useEffect, useRef, useState, createContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { toastDurationMs } from "@/lib/upload-notice";
import { useT } from "@/lib/i18n/client";
import { IconCheck, IconInfo } from "@/components/icons";

type ToastOptions = { durationMs?: number | null; href?: string; hrefLabel?: string };
type ToastMessage = { text: string; error?: boolean; href?: string; hrefLabel?: string };
type ToastApi = {
  show: (text: string, error?: boolean, options?: ToastOptions) => void;
  clear: () => void;
  node: ReactNode;
};
type Queued = ToastMessage & { id: number; durationMs: number | null };

/** At most this many toasts are visible; the oldest leaves first. */
export const MAX_TOASTS = 3;

const ToastContext = createContext<ToastApi | null>(null);
let seq = 0;

/** Adds a toast to the queue, dropping the oldest past MAX_TOASTS. An identical visible message is replaced. */
export function enqueueToast(list: Queued[], next: Queued): Queued[] {
  const kept = list.filter((t) => !(t.text === next.text && Boolean(t.error) === Boolean(next.error)));
  return [...kept, next].slice(-MAX_TOASTS);
}

/**
 * One toast region for the dashboard (design system, phase 1). Routine results fade after 5 seconds;
 * errors stay until dismissed. Timers pause while a toast is hovered or focused. Toasts stack (up to 3).
 * Navigating to another page clears them, as before. The upload queue itself stays mounted in the shell.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [trackedPath, setTrackedPath] = useState(pathname);
  const [list, setList] = useState<Queued[]>([]);

  const clear = useCallback(() => setList([]), []);
  const dismiss = useCallback((id: number) => setList((cur) => cur.filter((t) => t.id !== id)), []);
  const show = useCallback((text: string, error = false, options?: ToastOptions) => {
    const item: Queued = { id: ++seq, text, error, href: options?.href, hrefLabel: options?.hrefLabel, durationMs: toastDurationMs(error, options?.durationMs) };
    setList((cur) => enqueueToast(cur, item));
  }, []);

  if (trackedPath !== pathname) {
    setTrackedPath(pathname);
    if (list.length) setList([]);
  }

  return (
    <ToastContext.Provider value={{ show, clear, node: null }}>
      {children}
      {list.length ? (
        <div className="ps-toaster" data-testid="toaster">
          {list.map((t) => <TimedToast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />)}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

function TimedToast({ toast, onDismiss }: { toast: Queued; onDismiss: () => void }) {
  const remaining = useRef(toast.durationMs);
  const started = useRef(0);
  const timer = useRef<number | null>(null);
  const done = useRef(onDismiss);
  done.current = onDismiss;

  const arm = useCallback(() => {
    if (remaining.current == null || timer.current) return;
    started.current = Date.now();
    timer.current = window.setTimeout(() => done.current(), remaining.current);
  }, []);
  const pause = useCallback(() => {
    if (!timer.current || remaining.current == null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
    remaining.current = Math.max(1500, remaining.current - (Date.now() - started.current));
  }, []);
  useEffect(() => {
    arm();
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [arm]);

  return (
    <div onMouseEnter={pause} onMouseLeave={arm} onFocus={pause} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) arm(); }}>
      <ToastView message={toast} onDismiss={onDismiss} />
    </div>
  );
}

export function useToast(): ToastApi {
  const shared = useContext(ToastContext);
  const local = useLocalToast();
  return shared ?? local;
}

/** Outside the dashboard shell (auth pages, preview harness pieces): one toast, rendered by the caller. */
function useLocalToast(): ToastApi {
  const [msg, setMsg] = useState<ToastMessage | null>(null);
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setMsg(null);
  }, []);

  const show = useCallback((text: string, error = false, options?: ToastOptions) => {
    setMsg({ text, error, href: options?.href, hrefLabel: options?.hrefLabel });
    if (timer.current) window.clearTimeout(timer.current);
    const ms = toastDurationMs(error, options?.durationMs);
    timer.current = ms == null ? null : window.setTimeout(() => { timer.current = null; setMsg(null); }, ms);
  }, []);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  return { show, clear, node: msg ? <div className="ps-toaster"><ToastView message={msg} onDismiss={clear} /></div> : null };
}

export function ToastView({ message, onDismiss }: { message: ToastMessage; onDismiss: () => void }) {
  const t = useT();
  return (
    <div
      role={message.error ? "alert" : "status"}
      aria-live={message.error ? "assertive" : "polite"}
      aria-atomic="true"
      className={`ps-toast${message.error ? " is-error" : ""}`}
      data-testid="toast"
    >
      {message.error ? <IconInfo /> : <IconCheck />}
      <p className="min-w-0">
        {message.text}
        {message.href ? <> <a href={message.href}>{message.hrefLabel || t("toast.open")}</a></> : null}
      </p>
      <button type="button" onClick={onDismiss}>{t("toast.dismiss")}</button>
    </div>
  );
}
