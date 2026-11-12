"use client";
import { useCallback, useContext, useEffect, useRef, useState, createContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { armToastTimer } from "@/lib/upload-notice";

type ToastOptions = { durationMs?: number | null; href?: string; hrefLabel?: string };
type ToastMessage = { text: string; error?: boolean; href?: string; hrefLabel?: string };
type ToastApi = {
  show: (text: string, error?: boolean, options?: ToastOptions) => void;
  clear: () => void;
  node: ReactNode;
};

function rememberToast(text: string, error: boolean, options: ToastOptions | undefined, setMsg: (msg: ToastMessage | null) => void, timer: { current: number | null }) {
  setMsg({ text, error, href: options?.href, hrefLabel: options?.hrefLabel });
  if (timer.current) window.clearTimeout(timer.current);
  timer.current = armToastTimer(error, options?.durationMs, () => {
    timer.current = null;
    setMsg(null);
  }, (fn, ms) => window.setTimeout(fn, ms));
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * One status region for the dashboard. Page toasts and the upload toast share
 * it, so a new message replaces the old one instead of stacking on the same
 * spot. Navigating clears a leftover message. The upload queue itself stays
 * mounted in the shell.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [trackedPath, setTrackedPath] = useState(pathname);
  const [msg, setMsg] = useState<ToastMessage | null>(null);
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setMsg(null);
  }, []);

  const show = useCallback((text: string, error = false, options?: ToastOptions) => {
    rememberToast(text, error, options, setMsg, timer);
  }, []);

  if (trackedPath !== pathname) {
    setTrackedPath(pathname);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setMsg(null);
  }

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={{ show, clear, node: null }}>
      {children}
      {msg ? <ToastView message={msg} onDismiss={clear} /> : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const shared = useContext(ToastContext);
  const local = useLocalToast();
  return shared ?? local;
}

function useLocalToast(): ToastApi {
  const [msg, setMsg] = useState<ToastMessage | null>(null);
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setMsg(null);
  }, []);

  const show = useCallback((text: string, error = false, options?: ToastOptions) => {
    rememberToast(text, error, options, setMsg, timer);
  }, []);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  return { show, clear, node: msg ? <ToastView message={msg} onDismiss={clear} /> : null };
}

export function ToastView({ message, onDismiss }: { message: ToastMessage; onDismiss: () => void }) {
  return (
    <div
      role={message.error ? "alert" : "status"}
      aria-live={message.error ? "assertive" : "polite"}
      aria-atomic="true"
      className={`fixed left-4 right-4 bottom-24 md:bottom-8 md:left-auto md:right-8 md:w-[24rem] z-[70] rounded-xl px-4 py-3 text-sm font-medium shadow-lg flex items-start gap-3 ${message.error ? "bg-danger text-white" : "bg-primary text-white"}`}
    >
      <p className="flex-1 leading-relaxed">
        {message.text}
        {message.href ? <> <a className="underline underline-offset-2" href={message.href}>{message.hrefLabel || "Open"}</a></> : null}
      </p>
      <button type="button" className="shrink-0 underline underline-offset-2" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}
