"use client";

import { useState } from "react";
import { api } from "@/lib/api";

/** Opens this org's Stripe Customer Portal, or the plan picker when there is no Stripe customer yet. */
export function ManageBilling({ className = "", label = "Manage billing", testId = "manage-billing" }: { className?: string; label?: string; testId?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ url?: string; action?: string }>("/api/billing/portal", { method: "POST", body: "{}" });
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      window.location.assign("/dashboard/billing#plans");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className={`btn min-h-11 ${className}`} data-testid={testId} disabled={busy} onClick={() => { void open(); }}>
        {busy ? "Opening…" : label}
      </button>
      {error ? <span className="text-sm text-danger" role="alert">{error}</span> : null}
    </span>
  );
}
