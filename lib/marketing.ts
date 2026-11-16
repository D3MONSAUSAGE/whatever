import { TRIAL } from "@/lib/plans";
import { en, format, type MessageKey } from "@/lib/i18n/index";

/**
 * Marketing copy. Every claim here maps to a feature that exists on main; don't add unbuilt ones.
 * The text lives in the dictionary (lib/i18n/en.ts, es.ts); these lists keep the order and the English
 * values for tests and non-UI callers. Pages render through t() with the same keys.
 */
export const FEATURE_IDS = ["devices", "media", "playlists", "schedules", "screens", "remote", "status", "analytics"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];
export const featureKeys = (id: FeatureId) => ({ title: `feature.${id}.title` as MessageKey, body: `feature.${id}.body` as MessageKey });
export const FEATURES = FEATURE_IDS.map((id) => ({ id, title: en[featureKeys(id).title], body: en[featureKeys(id).body] }));

export const SHOTS = {
  dashboard: { src: "/marketing/dashboard.webp", altKey: "shot.dashboard", w: 1200, h: 750 },
  playlists: { src: "/marketing/playlists.webp", altKey: "shot.playlists", w: 1200, h: 750 },
  schedule: { src: "/marketing/schedule.webp", altKey: "shot.schedule", w: 1200, h: 750 },
  displays: { src: "/marketing/displays.webp", altKey: "shot.displays", w: 1200, h: 750 },
  media: { src: "/marketing/media.webp", altKey: "shot.media", w: 1200, h: 750 },
  tvMenu: { src: "/marketing/tv-menu.webp", altKey: "shot.tvMenu", w: 1200, h: 675 },
  tvPromo: { src: "/marketing/tv-promo.webp", altKey: "shot.tvPromo", w: 1200, h: 675 },
} as const satisfies Record<string, { src: string; altKey: MessageKey; w: number; h: number }>;

export const FAQ_IDS = ["trial", "trialEnd", "screen", "plans", "devices", "hardware", "internet", "cancel", "pptx", "compat", "connect"] as const;
/** The short list on the home page, in the order the landing page asks them. */
export const HOME_FAQ_IDS = ["hardware", "compat", "trial", "connect", "plans"] as const satisfies readonly FaqId[];
export type FaqId = (typeof FAQ_IDS)[number];
export const faqKeys = (id: FaqId) => ({ q: `faq.${id}.q` as MessageKey, a: `faq.${id}.a` as MessageKey });
export const FAQ_VARS = { days: TRIAL.days, screens: TRIAL.screens };
export const FAQ: { q: string; a: string }[] = FAQ_IDS.map((id) => ({ q: en[faqKeys(id).q], a: format(en[faqKeys(id).a], FAQ_VARS) }));
