"use client";
import Link from "next/link";
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
    <div role="status" data-testid="billing-banner" className="card mb-5 p-3 md:p-4 border-l-4 border-l-primary">
      <p>{message}</p>
      <Link href={select ? "/dashboard/billing#screens" : "/dashboard/billing"} className="btn btn-quiet mt-2">
        {select ? "Choose screens" : "Review plan"}
      </Link>
    </div>
  );
}
