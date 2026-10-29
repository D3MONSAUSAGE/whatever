"use client";
import { useCallback, useContext, useEffect, useRef, useState, createContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type ToastMessage = { text: string; error?: boolean };
type ToastApi = {
  show: (text: string, error?: boolean) => void;
  clear: () => void;
  node: ReactNode;
};

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

  const show = useCallback((text: string, error = false) => {
    setMsg({ text, error });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), error ? 8000 : 3500);
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

  const show = useCallback((text: string, error = false) => {
    setMsg({ text, error });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), error ? 8000 : 3500);
  }, []);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  return { show, clear, node: msg ? <ToastView message={msg} onDismiss={clear} /> : null };
}

function ToastView({ message, onDismiss }: { message: ToastMessage; onDismiss: () => void }) {
  return (
    <div role="status" className={`fixed left-4 right-4 bottom-24 md:bottom-8 md:left-auto md:right-8 md:w-[24rem] z-[70] rounded-xl px-4 py-3 text-sm font-medium shadow-lg flex items-start gap-3 ${message.error ? "bg-danger text-white" : "bg-primary text-white"}`}>
      <p className="flex-1 leading-relaxed">{message.text}</p>
      <button type="button" className="shrink-0 underline underline-offset-2" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}
