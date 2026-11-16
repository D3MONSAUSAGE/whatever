"use client";
import Link from "next/link";
import { ManageBilling } from "@/components/manage-billing";
import { useApi } from "@/lib/api";

type Entitlements = {
  warning: { message: string; action: string | null } | null;
  rollout_notice: string | null;
};

/** In-app billing notice on every dashboard page. Email is a separate path and stays off until EMAIL_PROVIDER is set. */
export function BillingBanner() {
  const ent = useApi<Entitlements>("/api/entitlements", 60_000);
  const message = ent.data?.warning?.message || ent.data?.rollout_notice;
  if (!message) return null;
  const select = ent.data?.warning?.action === "select_screens";
  return (
    <div role="status" data-testid="billing-banner" className="card mb-3 sm:mb-5 p-3 md:p-4 border-l-4 border-l-primary">
      {/* Parity Phase 1 (W3): smaller type and spacing on a phone. Layout only; billing logic unchanged. */}
      <p className="text-sm sm:text-base">{message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link href={select ? "/dashboard/billing#screens" : "/dashboard/billing"} className="btn btn-quiet">
          {select ? "Choose screens" : "Review plan"}
        </Link>
        <ManageBilling className="btn-quiet" />
      </div>
    </div>
  );
}
