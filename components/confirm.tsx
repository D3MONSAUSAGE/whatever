"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";

export type ConfirmRequest = {
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  input?: { label: string; ariaLabel: string; defaultValue?: string; maxLength?: number };
};

type Pending = ConfirmRequest & { resolve: (value: string | boolean | null) => void };

/** One confirmation dialog for delete, disconnect, and rename. */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);

  const ask = useCallback((request: ConfirmRequest) => {
    return new Promise<string | boolean | null>((resolve) => {
      setPending({ ...request, resolve });
    });
  }, []);

  const close = useCallback((value: string | boolean | null) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const node = pending ? <ConfirmDialog key={pending.title} pending={pending} onClose={close} /> : null;
  return { ask, node };
}

function ConfirmDialog({ pending, onClose }: { pending: Pending; onClose: (value: string | boolean | null) => void }) {
  const titleId = useId();
  const bodyId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [value, setValue] = useState(pending.input?.defaultValue ?? "");

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (pending.input) inputRef.current?.select();
    else cancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose(null);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, pending.input]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!pending.confirmLabel) return;
    if (pending.input) {
      const next = value.trim();
      if (!next) return;
      onClose(next);
      return;
    }
    onClose(true);
  }

  return (
    <div className="fixed inset-0 z-[80] bg-ink/50 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={() => onClose(null)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-line shadow-xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={(event) => event.stopPropagation()}
      >
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">{pending.title}</h2>
            <div id={bodyId} className="text-sm text-muted mt-2 leading-relaxed">{pending.body}</div>
          </div>
          {pending.input && (
            <label className="grid gap-1">
              <span className="text-sm font-medium text-ink">{pending.input.label}</span>
              <input
                ref={inputRef}
                className="field"
                aria-label={pending.input.ariaLabel}
                maxLength={pending.input.maxLength}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                required
              />
            </label>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button ref={cancelRef} type="button" className="btn btn-quiet" onClick={() => onClose(null)}>
              {pending.cancelLabel ?? "Cancel"}
            </button>
            {pending.confirmLabel && (
              <button type="submit" className={`btn ${pending.danger ? "btn-danger" : "btn-primary"}`}>
                {pending.confirmLabel}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
