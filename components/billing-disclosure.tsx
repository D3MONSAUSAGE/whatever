import Link from "next/link";
import { LEGAL_ADDRESS, LEGAL_OPERATOR, REFUND_POLICY, SUPPORT_EMAIL } from "@/lib/legal";
import { PLANS } from "@/lib/plans";
import { COURTESY_NOTICE_ES, LEGAL_OPERATOR_ES, REFUND_POLICY_ES, planPricesEs } from "@/lib/legal-es";

/** Seller, price, cancel, and refund facts shown before any payment choice. */
export function BillingDisclosure({ className = "", locale = "en" }: { className?: string; locale?: string }) {
  if (locale === "es") return <BillingDisclosureEs className={className} />;
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

/** Spanish courtesy translation of the disclosure above (locale "es" only). The English version governs. */
function BillingDisclosureEs({ className }: { className: string }) {
  return (
    <div className={`text-sm grid gap-2 ${className}`} data-testid="billing-disclosure" lang="es">
      <p className="text-muted" data-testid="courtesy-notice">
        {COURTESY_NOTICE_ES}{" "}
        <Link className="underline" href="/terms?lang=en#billing" hrefLang="en" data-testid="english-original">Ver los términos originales en inglés</Link>.
      </p>
      <p>Vendedor: {LEGAL_OPERATOR_ES}. {LEGAL_ADDRESS}.</p>
      <p>Precios mensuales, en dólares estadounidenses: {planPricesEs()}. Un plan se renueva hasta que se cancela. Cancelar detiene la siguiente renovación, y el acceso continúa durante el período ya pagado. Pausar una pantalla no elimina contenido ni configuración.</p>
      <p>{REFUND_POLICY_ES}</p>
      <p>
        Escriba a <a className="underline font-semibold" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        {" "}Los términos completos de facturación están en los <Link className="underline font-semibold" href="/terms#billing">Términos del servicio</Link>.
      </p>
    </div>
  );
}
