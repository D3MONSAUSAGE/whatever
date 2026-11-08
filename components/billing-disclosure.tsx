import Link from "next/link";
import { LEGAL_ADDRESS, LEGAL_OPERATOR, REFUND_POLICY, SUPPORT_EMAIL } from "@/lib/legal";
import { PLANS } from "@/lib/plans";

/** Seller, price, cancel, and refund facts shown before any payment choice. */
export function BillingDisclosure({ className = "" }: { className?: string }) {
  const prices = PLANS.map((plan) => `${plan.name} $${plan.price} for ${plan.screens} screen${plan.screens === 1 ? "" : "s"}`).join(", ");
  return (
    <div className={`text-sm grid gap-2 ${className}`} data-testid="billing-disclosure">
      <p>Seller: {LEGAL_OPERATOR}. {LEGAL_ADDRESS}.</p>
      <p>Monthly prices, in US dollars: {prices}. A plan renews until it is canceled. Canceling stops the next renewal, and access continues through the period already paid. Pausing a screen does not delete content or settings.</p>
      <p>{REFUND_POLICY}</p>
      <p>
        Email <a className="underline font-semibold" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        {" "}The full billing terms are in the <Link className="underline font-semibold" href="/terms#billing">Terms of Service</Link>.
      </p>
    </div>
  );
}
