/**
 * Spanish courtesy translation of the legal facts (Francisco approved the courtesy translation;
 * the English version governs). Shown only when the locale is "es". The English constants in
 * ./legal stay the source of truth: dates, prices, days and the address come from there.
 */
import { LEGAL_PRIVACY_UPDATED, LEGAL_UPDATED } from "./legal";
import { PLANS } from "./plans";

export const COURTESY_NOTICE_ES =
  "Esta traducción es solo para su comodidad. La versión en inglés es la que rige; en caso de discrepancia, prevalece la versión en inglés.";
export const ENGLISH_ORIGINAL_ES = "Ver la versión original en inglés";

export const LEGAL_OPERATOR_ES = "Francisco Lopez, propietario único, que opera como Pekko";
/**
 * Ownership sentence: two prepared versions, pending Francisco's wording decision.
 * - "general" (current default): names no other company, per the brief; broader than the English.
 * - "faithful": mirrors LEGAL_OWNERSHIP and names both companies, like the English.
 * Switching is a one-line change of OWNERSHIP_VARIANT; tests cover both.
 */
export const LEGAL_OWNERSHIP_ES_GENERAL =
  "Pekko es propiedad exclusiva de Francisco Lopez. No es una sociedad de responsabilidad limitada (LLC) y es totalmente independiente de cualquier otra empresa.";
export const LEGAL_OWNERSHIP_ES_FAITHFUL =
  "Pekko es propiedad exclusiva de Francisco Lopez. No es Pekko LLC y es totalmente independiente de Teamtegrate LLC.";
export type OwnershipVariant = "general" | "faithful";
export const OWNERSHIP_VARIANT = "general" as OwnershipVariant;
export const LEGAL_OWNERSHIP_ES = OWNERSHIP_VARIANT === "faithful" ? LEGAL_OWNERSHIP_ES_FAITHFUL : LEGAL_OWNERSHIP_ES_GENERAL;
export const REFUND_POLICY_ES =
  "Los pagos de suscripciones mensuales no se reembolsan por tiempo no utilizado ni por una cancelación a mitad de un período de facturación, salvo cuando la ley aplicable exija un reembolso. Los cargos duplicados o incorrectos confirmados se corregirán. Cancelar detiene la siguiente renovación; el acceso continúa hasta el final del período ya pagado.";

const MONTHS: Record<string, string> = {
  January: "enero", February: "febrero", March: "marzo", April: "abril", May: "mayo", June: "junio",
  July: "julio", August: "agosto", September: "septiembre", October: "octubre", November: "noviembre", December: "diciembre",
};

/** "November 8, 2026" -> "8 de noviembre de 2026". Same date, derived from the English constant. */
export function legalDateEs(english: string): string {
  const m = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(english);
  if (!m || !MONTHS[m[1]]) throw new Error(`Unexpected legal date: ${english}`);
  return `${m[2]} de ${MONTHS[m[1]]} de ${m[3]}`;
}

export const LEGAL_UPDATED_ES = legalDateEs(LEGAL_UPDATED);
export const LEGAL_PRIVACY_UPDATED_ES = legalDateEs(LEGAL_PRIVACY_UPDATED);

/** "Starter $19 por 1 pantalla, Business $39 por 3 pantallas, …": plan names and prices unchanged. */
export function planPricesEs(): string {
  return PLANS.map((plan) => `${plan.name} $${plan.price} por ${plan.screens} pantalla${plan.screens === 1 ? "" : "s"}`).join(", ");
}
