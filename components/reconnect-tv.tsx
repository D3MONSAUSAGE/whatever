"use client";

import { useState } from "react";
import { api, type DisplayItem } from "@/lib/api";
import { useConfirm } from "@/components/confirm";
import { reconnectCode, reconnectIntro } from "@/lib/reconnect-tv";

/**
 * B2-06: connect a re-opened or replacement TV to this existing screen with the code it shows.
 * The screen keeps its content, schedules and groups; the TV connected before is disconnected.
 */
export function ReconnectTv({ display, onConnected, onMessage, preview = false }: {
  display: DisplayItem;
  onConnected: () => void;
  onMessage: (text: string, error?: boolean) => void;
  preview?: boolean;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const needsTv = !display.connected || !display.online;

  async function submit() {
    const clean = reconnectCode(code);
    if (!clean) { setError("Enter the 6-digit code shown on the TV."); return; }
    setError(null);
    if (display.connected && display.online) {
      const ok = await confirm.ask({
        title: "Replace the TV on this screen?",
        body: `“${display.name}” is online now. Connecting another TV disconnects that one. Its content stays on this screen.`,
        confirmLabel: "Connect the new TV",
      });
      if (ok !== true) return;
    }
    setBusy(true);
    try {
      await api(`/api/displays/${display.id}/reconnect`, { method: "POST", body: JSON.stringify({ code: clean }) });
      setCode("");
      onMessage(`TV connected to “${display.name}”. It shows this screen's content within a minute.`);
      onConnected();
    } catch (err) {
      setError((err as Error).message || "Couldn't connect the TV. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-4 rounded-xl border border-line p-3" open={needsTv} data-testid="reconnect-tv">
      <summary className="font-semibold cursor-pointer min-h-11 flex items-center">{needsTv ? "Reconnect a TV to this screen" : "Replace the TV on this screen"}</summary>
      <p className="text-sm mt-2">{reconnectIntro(display)}</p>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label className="grid gap-1">
          <span className="form-label">Code on the TV</span>
          <input
            className="field w-40 tracking-widest"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `reconnect-error-${display.id}` : undefined}
            disabled={busy || preview}
          />
        </label>
        <button type="submit" className="btn btn-primary min-h-11" disabled={busy || preview}>{busy ? "Connecting…" : "Connect this TV"}</button>
      </form>
      {error ? <p id={`reconnect-error-${display.id}`} className="text-sm text-danger mt-2" role="alert">{error}</p> : null}
      {confirm.node}
    </details>
  );
}
