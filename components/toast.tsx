"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
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

  const node = msg ? (
    <div role="status" className={`fixed left-4 right-4 bottom-24 md:bottom-8 md:left-auto md:right-8 md:w-[24rem] z-[70] rounded-xl px-4 py-3 text-sm font-medium shadow-lg flex items-start gap-3 ${msg.error ? "bg-danger text-white" : "bg-ink text-white"}`}>
      <p className="flex-1 leading-relaxed">{msg.text}</p>
      <button type="button" className="shrink-0 underline underline-offset-2" onClick={clear}>Dismiss</button>
    </div>
  ) : null;
  return { show, node };
}
