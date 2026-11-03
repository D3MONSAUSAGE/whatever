/** Approved prices (USD per month). Do not change without Francisco's approval. */
export const PLANS = [
  { id: "starter", name: "Starter", price: 19, screens: 1 },
  { id: "business", name: "Business", price: 39, screens: 3 },
  { id: "multi", name: "Multi-screen", price: 59, screens: 5 },
] as const;
export const TRIAL = { days: 14, screens: 5 } as const;
/** TODO(Francisco): set the real support address before release. Until then no address is shown. */
export const SUPPORT_EMAIL: string | null = null;
export const SUPPORT_PLACEHOLDER = "[Support email: TODO, pending Francisco's choice]";
