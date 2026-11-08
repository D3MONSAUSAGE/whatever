/** Approved prices (USD per month). Do not change without Francisco's approval. */
export const PLANS = [
  { id: "starter", name: "Starter", price: 19, screens: 1 },
  { id: "business", name: "Business", price: 39, screens: 3 },
  { id: "multi", name: "Multi-screen", price: 59, screens: 5 },
] as const;
export const TRIAL = { days: 14, screens: 5 } as const;
export { SUPPORT_EMAIL } from "./legal";
