/**
 * Legal operator and support contact, set per environment (Vercel env vars).
 * The operating entity has NOT been chosen: until NEXT_PUBLIC_LEGAL_OPERATOR_NAME is set,
 * pages show a clearly marked placeholder and never state an entity as fact.
 */
const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LEGAL_OPERATOR_NAME: string | null = clean(process.env.NEXT_PUBLIC_LEGAL_OPERATOR_NAME);
export const LEGAL_OPERATOR_PLACEHOLDER = "[Legal entity name: to be confirmed]";
export const legalOperator = () => LEGAL_OPERATOR_NAME ?? LEGAL_OPERATOR_PLACEHOLDER;

const rawSupport = clean(process.env.NEXT_PUBLIC_SUPPORT_EMAIL);
export const SUPPORT_EMAIL: string | null = rawSupport && EMAIL_RE.test(rawSupport) ? rawSupport : null;
export const SUPPORT_PLACEHOLDER = "[Support email: to be confirmed]";
