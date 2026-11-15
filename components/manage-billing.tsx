"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import { afterPortalResponse, jumpToPlansPicker } from "@/lib/billing-view";

/** Opens this org's Stripe Customer Portal, or the plan picker when there is no Stripe customer yet. */
export function ManageBilling({ className = "", label, testId = "manage-billing" }: { className?: string; label?: string; testId?: string }) {
  // R11 I18N2-F2: the button names a nav action, so its label follows the language. Billing terms stay English.
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ url?: string; action?: string }>("/api/billing/portal", { method: "POST", body: "{}" });
      const next = afterPortalResponse(result);
      if (next.kind === "portal") {
        window.location.assign(next.url);
        return;
      }
      // Trial (or no Stripe customer): stay in the app. Clear busy so the button
      // does not stick on "Opening…" when this is only a same-document hash change.
      setBusy(false);
      jumpToPlansPicker(window.location, document);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className={`btn min-h-11 ${className}`} data-testid={testId} disabled={busy} onClick={() => { void open(); }}>
        {busy ? t("billing.opening") : (label ?? t("billing.manage"))}
      </button>
      {error ? <span className="text-sm text-danger" role="alert">{error}</span> : null}
    </span>
  );
}
