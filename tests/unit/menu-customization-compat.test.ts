import { describe, expect, it } from "vitest";
import { hashes } from "../../scripts/customization-baseline";
import baseline from "../fixtures/customization-default-baseline.json";

/**
 * Guided customization must not change any existing board. The baseline was recorded on main before the feature
 * (scripts/customization-baseline.ts): 340 boards across all 22 templates (every colour style, photo, Fill/Fit,
 * video, long/short/small menus, item photos, brand colours), the 7 original layouts and the 3 classic themes.
 * Identical SVG bytes means an identical picture in the editor, the server PNG and on the TV.
 */
describe("boards without customization render byte-identically", () => {
  it("matches the pre-feature baseline for every template and case", () => {
    const now = hashes();
    expect(Object.keys(baseline).length).toBe(340);
    const changed = Object.entries(baseline).filter(([key, hash]) => now[key] !== hash).map(([key]) => key);
    expect(changed).toEqual([]);
  });
});
