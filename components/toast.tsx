"use client";
import { useCallback, useState } from "react";

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const show = useCallback((text: string, error = false) => {
    setMsg({ text, error });
    setTimeout(() => setMsg(null), 3500);
  }, []);
  const node = msg ? (
    <div role="status" className={`fixed left-4 right-4 bottom-24 md:bottom-8 md:left-auto md:w-96 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${msg.error ? "bg-danger text-white" : "bg-ink text-white"}`}>
      {msg.text}
    </div>
  ) : null;
  return { show, node };
}
