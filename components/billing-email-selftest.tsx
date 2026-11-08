"use client";
import { useState } from "react";
import { api } from "@/lib/api";

/** Default run id when the field is blank. Letters, numbers, and a hyphen only. */
export function selfTestRunId(now = Date.now()): string {
  return `test-${now}`;
}

export type SelfTestRow = {
  kind: string;
  sent: boolean;
  reason: string;
  id: string | null;
  error: string | null;
};

/** Shown only when the server says this org is allowlisted. Renders nothing otherwise. */
export function BillingEmailSelfTest({ enabled }: { enabled: boolean }) {
  const [run, setRun] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SelfTestRow[] | null>(null);
  if (!enabled) return null;

  async function send() {
    const id = run.trim() || selfTestRunId();
    setRun(id);
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ templates: SelfTestRow[] }>("/api/billing/notifications/test", {
        method: "POST",
        body: JSON.stringify({ run: id }),
      });
      setRows(result.templates);
    } catch (err) {
      setRows(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5 space-y-3" aria-labelledby="selftest-heading" data-testid="billing-email-selftest">
      <h2 id="selftest-heading" className="text-lg font-semibold">Send test billing emails</h2>
      <p className="text-sm text-muted">Sends the six billing templates to your own account email. It does not change your plan.</p>
      <label className="block text-sm font-semibold" htmlFor="selftest-run">Run id</label>
      <input id="selftest-run" className="field" value={run} onChange={(event) => setRun(event.target.value)}
        placeholder="Leave blank for a timestamp id" autoComplete="off" />
      <button type="button" className="btn btn-quiet" disabled={busy} onClick={send}>
        {busy ? "Sending…" : "Send test billing emails"}
      </button>
      {error ? <p className="text-danger text-sm" role="alert">{error}</p> : null}
      {rows ? <SelfTestResults rows={rows} /> : null}
    </section>
  );
}

export function SelfTestResults({ rows }: { rows: SelfTestRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="selftest-results">
        <thead>
          <tr className="text-left">
            <th className="py-1 pr-3">Kind</th>
            <th className="py-1 pr-3">Sent</th>
            <th className="py-1 pr-3">Reason</th>
            <th className="py-1 pr-3">Id</th>
            <th className="py-1">Error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.kind} className="border-t border-line">
              <td className="py-1 pr-3">{row.kind}</td>
              <td className="py-1 pr-3">{row.sent ? "yes" : "no"}</td>
              <td className="py-1 pr-3">{row.reason}</td>
              <td className="py-1 pr-3">{row.id ?? ""}</td>
              <td className="py-1">{row.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
