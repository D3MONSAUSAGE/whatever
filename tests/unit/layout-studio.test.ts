import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BOARD_H, BOARD_W, frameFor, layoutStudioEnabled, layoutSvg, paintAfterStill, paintAfterVideoFailed,
  paintAfterVideoPlaying, parseLayout, playerComposition, sampleLayout, type LayoutTemplate, type ZoneBox,
} from "@/lib/layout-studio";
import { renderLayoutPng } from "@/lib/server/layout-render";

const templates: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature"];

function covered(boxes: ZoneBox[]) {
  const seen = new Uint8Array(BOARD_W * BOARD_H);
  for (const box of boxes) {
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w; x++) {
        const i = y * BOARD_W + x;
        if (seen[i]) return "overlap";
        seen[i] = 1;
      }
    }
  }
  let count = 0;
  for (const cell of seen) count += cell;
  return count;
}

describe("layout studio frames", () => {
  it("tiles 1920×1080 for each template", () => {
    for (const template of templates) {
      const frame = frameFor(template, sampleLayout(template).split);
      expect(frame.menu.w).toBeGreaterThan(0);
      expect(frame.feature.w).toBeGreaterThan(0);
      if (template === "signature") {
        expect(frame.feature).toEqual({ x: 0, y: 0, w: BOARD_W, h: BOARD_H });
        expect(frame.menu.x).toBe(0);
        expect(frame.menu.w).toBeLessThan(BOARD_W);
      } else if (template === "triple-column") {
        expect(covered(frame.columns)).toBe(BOARD_W * BOARD_H);
        expect(frame.feature).toEqual(frame.columns[2]);
      } else {
        expect(covered([frame.menu, frame.feature])).toBe(BOARD_W * BOARD_H);
      }
    }
    expect(frameFor("menu-promo-67", 0.67).feature).toEqual({ x: 1286, y: 0, w: 634, h: 1080 });
  });

  it("rejects markup, a second video, and a split outside the template", () => {
    const sample = sampleLayout("split-50");
    expect(parseLayout({ ...sample, title: "<script>alert(1)</script>" }).ok).toBe(false);
    expect(parseLayout({ ...sample, videos: [{}, {}] }).ok).toBe(false);
    expect(parseLayout({ ...sample, split: 0.9 }).ok).toBe(false);
    expect(parseLayout({ ...sample, videoMediaId: "not-a-uuid" }).ok).toBe(false);
    const parsed = parseLayout(sample);
    expect(parsed.ok).toBe(true);
  });

  it("acknowledges a version only for a whole frame", () => {
    expect(paintAfterStill(false)).toEqual({ phase: "legacy", ack: true });
    expect(paintAfterStill(true)).toEqual({ phase: "video-pending", ack: false });
    expect(paintAfterVideoPlaying()).toEqual({ phase: "video-playing", ack: true });
    expect(paintAfterVideoFailed(true)).toEqual({ phase: "fallback", ack: true });
    expect(paintAfterVideoFailed(false)).toEqual({ phase: "video-pending", ack: false });
    const doc = { ...sampleLayout("menu-promo-67"), videoMediaId: "00000000-0000-4000-8000-000000000001" };
    expect(playerComposition(doc, "https://png", null)).toBeNull();
    const composition = playerComposition(doc, "https://png", "https://mp4");
    expect(composition?.video?.box).toEqual({ x: 1286, y: 0, w: 634, h: 1080 });
    expect(composition).not.toHaveProperty("groupIndex");
    expect(layoutStudioEnabled({})).toBe(false);
    expect(layoutStudioEnabled({ LAYOUT_STUDIO: "true" })).toBe(false);
    expect(layoutStudioEnabled({ LAYOUT_STUDIO: "1" })).toBe(true);
  });

  it("draws a complete board, including the video slot", () => {
    const svg = layoutSvg(sampleLayout("menu-promo-67"));
    expect(svg).toContain(`width="${BOARD_W}"`);
    expect(svg).toContain("Casa Mesa");
    expect(svg).not.toContain("<script");
    const png = renderLayoutPng({ ...sampleLayout("signature"), videoMediaId: "00000000-0000-4000-8000-000000000001" });
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });
});

describe("player composition contract", () => {
  const player = readFileSync("public/player.html", "utf8");
  const route = readFileSync("app/api/player/state/route.ts", "utf8");
  const attach = readFileSync("lib/server/layout-player.ts", "utf8");

  it("keeps slide counters on the group and withholds the version until the zone settles", () => {
    const copyGroup = player.slice(player.indexOf("function copyGroup"), player.indexOf("function zoneVideo"));
    expect(copyGroup).toContain("groupIndex");
    expect(copyGroup).not.toContain("composition");
    expect(player).toContain("if (zoneVideo(item)) placeZoneVideo(item, versionOrNull, token);");
    expect(player).toContain("else ackShown(versionOrNull);");
    expect(player).toContain("if (!zoneVideo(items[startAt])) shownVersion = version;");
    expect(player).toContain("v.muted = true;");
    expect(player).toContain("The other element stays the next-item preload.");
    expect(player).toContain("settle(false)");
    expect(route).toContain("await attachLayoutCompositions(items);");
    expect(attach).toContain("if (!layoutStudioEnabled()) return;");
    expect(attach).not.toContain("groupIndex");
    expect(attach).not.toContain("groupCount");
  });
});
