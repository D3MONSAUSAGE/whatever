import { en, type MessageKey } from "./en";
import { es } from "./es";
import { DEFAULT_LOCALE, type Locale } from "./locales";

export { en, es };
export type { MessageKey };
export * from "./locales";

/** One dictionary per locale. Customer-entered content (menus, product names, prices, file names) never goes through here. */
export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, es };

/**
 * Keys whose Spanish entry intentionally repeats the English text: billing wording waiting for the reviewed
 * courtesy translation (Francisco t278: lands in batch (c)/(d) with an "English governs" note). Removing a
 * key from this list is the switch-on; the unit test enforces es === en for every key still listed.
 */
export const ENGLISH_ONLY: readonly MessageKey[] = [
  "faq.trial.q", "faq.trial.a",
  "faq.trialEnd.q", "faq.trialEnd.a",
  "faq.plans.q", "faq.plans.a",
  "faq.cancel.q", "faq.cancel.a",
];

export type Vars = Record<string, string | number>;

/** Replaces {name} placeholders. Unknown placeholders are left as-is so a missing var is visible, not blank. */
export function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const table = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  const template = table[key] ?? en[key] ?? key;
  return format(template, vars);
}

export type T = (key: MessageKey, vars?: Vars) => string;

export function makeT(locale: Locale): T {
  return (key, vars) => translate(locale, key, vars);
}

export function hasKey(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}
