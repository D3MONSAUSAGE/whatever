"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useLocale, useT } from "@/lib/i18n/client";

export type EntitlementsStatus = {
  state: string;
  plan: string;
  plan_name: string;
  warning: { kind: string; message: string; action?: string | null } | null;
  status_detail?: { kind: string; message: string } | null;
  has_payment_method?: boolean;
  payment_method?: { brand: string; last4: string } | null;
  is_owner?: boolean;
  checkout_pending?: { plan: "starter" | "business" | "multi"; expires_at: string } | null;
  billing_starts_at?: string | null;
  next_billing_at?: string | null;
};

export function BillingStatusBanner({
  entitlements,
  variant = "banner",
  allowCheckoutActions = false,
  onChanged,
}: {
  entitlements: EntitlementsStatus | null | undefined;
  variant?: "banner" | "card";
  allowCheckoutActions?: boolean;
  onChanged?: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const planLabel = (plan: string) => plan === "multi" ? (locale === "es" ? "Multi-pantalla" : "Multi-screen") : plan === "business" ? "Business" : plan === "starter" ? "Starter" : plan;
  const [busy, setBusy] = useState<"resume" | "replace" | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!entitlements) return null;
  const pending = entitlements.checkout_pending;
  const message = entitlements.warning?.message || entitlements.status_detail?.message || null;
  const tone = entitlements.warning ? "warn" : "info";
  if (!pending && !message) return null;

  async function checkout(plan: string, replace: boolean) {
    setBusy(replace ? "replace" : "resume");
    setError(null);
    try {
      const r = await api<{ url?: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan, replace }) });
      if (r.url) {
        window.location.assign(r.url);
        return;
      }
      onChanged?.();
      setBusy(null);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  const planName = pending ? planLabel(pending.plan) : "";

  return (
    <section
      className={`card p-4 space-y-2 ${tone === "warn" ? "border-amber-200" : ""}`}
      data-testid={variant === "card" ? "account-billing-status" : "billing-status-banner"}
      aria-live="polite"
    >
      {pending && entitlements.is_owner ? (
        <>
          <p className="font-medium" data-testid="checkout-pending-title">{t("billing.unfinishedTitle")}</p>
          <p className="text-sm text-muted">{t("billing.unfinishedBody", { plan: planName })}</p>
        </>
      ) : message ? (
        <p className={entitlements.warning ? "font-medium" : "text-sm"} data-testid="billing-status-message">{message}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {allowCheckoutActions && pending && entitlements.is_owner ? (
          <>
            <button type="button" className="btn btn-primary min-h-11" data-testid="resume-checkout" disabled={!!busy} onClick={() => void checkout(pending.plan, false)}>
              {busy === "resume" ? t("billing.opening") : t("billing.resume")}
            </button>
            <button type="button" className="btn btn-quiet min-h-11" data-testid="start-over-checkout" disabled={!!busy} onClick={() => void checkout(pending.plan, true)}>
              {busy === "replace" ? t("billing.opening") : t("billing.startOver")}
            </button>
          </>
        ) : null}
        {entitlements.is_owner ? (
          <Link href="/dashboard/billing" className="btn btn-quiet min-h-11" data-testid="review-billing">{t("billing.reviewPlan")}</Link>
        ) : null}
      </div>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
    </section>
  );
}
