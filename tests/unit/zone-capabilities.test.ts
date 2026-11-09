import { describe, expect, it } from "vitest";
import { zoneCapabilities, type LayoutTemplate } from "@/lib/layout-studio";

const templates: LayoutTemplate[] = ["menu-promo-67", "split-50", "menu-banner", "signature", "triple-column"];

describe("zone capabilities", () => {
  it("gives every template a menu and only one video zone, except three columns", () => {
    for (const template of templates) {
      const zones = zoneCapabilities(template);
      expect(zones.some((zone) => zone.text && zone.id !== "photo" && zone.id !== "background" && zone.id !== "feature" || zone.id === "menu" || zone.id.startsWith("column-"))).toBe(true);
      const videos = zones.filter((zone) => zone.video);
      if (template === "triple-column") expect(videos).toEqual([]);
      else expect(videos).toHaveLength(1);
      expect(zones.filter((zone) => zone.image).every((zone) => zone.id !== "menu" && !zone.id.startsWith("column-"))).toBe(true);
    }
    expect(zoneCapabilities("menu-promo-67").find((zone) => zone.id === "feature")).toMatchObject({ label: "Promotion", image: true, video: true });
    expect(zoneCapabilities("triple-column").find((zone) => zone.id === "photo")).toMatchObject({ image: true, video: false });
  });
});
