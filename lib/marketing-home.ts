/**
 * Home page (Option B) template switcher data. Ids are real templates from lib/menu-designs.ts; the hero shows
 * pre-rendered images of them (public/marketing/templates/<id>-{640,1280}.webp, made by the production renderer
 * with Pekko's own sample content), and the live demo renders them in the browser with the same renderer.
 * Template names come from the template itself, so the caption never states a count.
 */
import type { MessageKey } from "@/lib/i18n/index";

export type HomeTemplate = { id: string; chip: MessageKey };

export const HERO_TEMPLATES: readonly HomeTemplate[] = [
  { id: "modern-restaurant", chip: "home2.chip.restaurant" },
  { id: "taqueria-specials", chip: "home2.chip.tacos" },
  { id: "coffee-shop", chip: "home2.chip.cafe" },
  { id: "smokehouse-bbq", chip: "home2.chip.bbq" },
  { id: "photo-menu-grid", chip: "home2.chip.fast" },
  { id: "brunch-house", chip: "home2.chip.brunch" },
  { id: "happy-hour", chip: "home2.chip.bar" },
];

export const DEMO_TEMPLATES: readonly HomeTemplate[] = [
  { id: "modern-restaurant", chip: "home2.chip.restaurant" },
  { id: "taqueria-specials", chip: "home2.chip.tacos" },
  { id: "coffee-shop", chip: "home2.chip.cafe" },
  { id: "smokehouse-bbq", chip: "home2.chip.bbq" },
  { id: "photo-menu-grid", chip: "home2.chip.photoGrid" },
  { id: "brunch-house", chip: "home2.chip.brunch" },
];

export const heroImage = (id: string, w: 640 | 1280) => `/marketing/templates/${id}-${w}.webp`;
export const heroSrcSet = (id: string) => `${heroImage(id, 640)} 640w, ${heroImage(id, 1280)} 1280w`;
export const HERO_SIZES = "(min-width: 980px) 620px, 92vw";
