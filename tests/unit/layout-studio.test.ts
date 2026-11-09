import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import {
  BOARD_H, BOARD_W, boxesOverlap, clientAcceptsZoneBox, containedBoard, fontFamily, frameFor, layoutStudioEnabled, layoutStudioPreviewOpen, layoutSvg, mediaVideoBox, MENU_LIMITS, paintAfterStill, PROMO_BAND, promoBandHeight, zoneOnBoard,
  paintAfterVideoFailed, paintAfterVideoPlaying, parseLayout, playerComposition, sampleLayout, zoneVideoStyle, type LayoutTemplate, type ZoneBox,
} from "@/lib/layout-studio";
import { prepareBoardPhoto, renderLayoutPng } from "@/lib/server/layout-render";

function pngPixel(png: Buffer, x: number, y: number): [number, number, number] {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 2;
  const idats: Buffer[] = [];
  while (offset + 8 <= png.length) {
    const len = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") idats.push(Buffer.from(data));
    else if (type === "IEND") break;
    offset += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idats));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  let cursor = 0;
  let prev = Buffer.alloc(stride);
  const rows: Buffer[] = [];
  for (let row = 0; row < height; row++) {
    const filter = raw[cursor];
    cursor += 1;
    const cur = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    const paeth = (left: number, up: number, ul: number) => {
      const p = left + up - ul;
      const pa = Math.abs(p - left);
      const pb = Math.abs(p - up);
      const pc = Math.abs(p - ul);
      return pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
    };
    for (let c = 0; c < stride; c++) {
      const left = c >= bpp ? cur[c - bpp] : 0;
      const up = prev[c];
      const ul = c >= bpp ? prev[c - bpp] : 0;
      const pred = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, ul) : 0;
      cur[c] = (cur[c] + pred) & 255;
    }
    rows.push(cur);
    prev = cur;
  }
  const sample = rows[y];
  const at = x * bpp;
  return [sample[at], sample[at + 1], sample[at + 2]];
}

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
        expect(frame.video && frame.video.x).toBe(frame.menu.w);
        expect(frame.video && frame.menu.w + frame.video.w).toBe(BOARD_W);
        expect(boxesOverlap(frame.menu, frame.video!)).toBe(false);
      } else if (template === "triple-column") {
        expect(covered(frame.columns)).toBe(BOARD_W * BOARD_H);
        expect(frame.feature).toEqual(frame.columns[2]);
      } else {
        expect(covered([frame.menu, frame.feature])).toBe(BOARD_W * BOARD_H);
      }
    }
    expect(frameFor("menu-promo-67", 0.67).video).toEqual({ x: 1286, y: 0, w: 634, h: 1080 });
    expect(frameFor("triple-column", 1 / 3).video).toBeNull();
  });

  it("keeps every existing menu item and draws an assigned photo", () => {
    const sample = sampleLayout("menu-promo-67");
    const items = Array.from({ length: MENU_LIMITS.itemsPerSection }, (_, index) => ({
      name: `Plate ${index + 1}`, price: "$9", description: "Served today",
    }));
    const parsed = parseLayout({ ...sample, sections: [{ name: "Plates", items }] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.sections[0].items).toHaveLength(MENU_LIMITS.itemsPerSection);
    const svg = layoutSvg(parsed.value);
    expect(svg).toContain("Plate 1");
    expect(svg).toContain(`Plate ${MENU_LIMITS.itemsPerSection}`);
    expect(svg).not.toContain("Playing on this screen");
    expect(parseLayout({ ...sample, sections: [{ name: "Plates", items: items.concat([{ name: "Extra", price: "$1", description: "" }]) }] }).ok).toBe(false);
    const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    expect(layoutSvg(sample, { imageHref: photo })).toContain("<image ");
    expect(layoutSvg(sample, { imageHref: "javascript:alert(1)" })).not.toContain("<image ");
    const signature = playerComposition({ ...sampleLayout("signature"), videoMediaId: "00000000-0000-4000-8000-000000000001" }, "https://png", "https://mp4");
    const frame = frameFor("signature", sampleLayout("signature").split);
    expect(signature?.video && boxesOverlap(frame.menu, signature.video.box)).toBe(false);
    expect(playerComposition({ ...sampleLayout("triple-column"), videoMediaId: "00000000-0000-4000-8000-000000000001" }, "https://png", "https://mp4")).toBeNull();
    const edited = parseLayout({
      ...sampleLayout("menu-promo-67"),
      title: "Casa Mesa Cantina & Grill Edited",
      sections: [{ name: "Plates", items: [
        { name: "Pollo asado", price: "$15.50", description: "Citrus chicken, rice, salsa" },
        { name: "Added special", price: "$9", description: "Kept on the board" },
      ] }],
    });
    expect(edited.ok).toBe(true);
    if (edited.ok) {
      expect(edited.value.title).toBe("Casa Mesa Cantina & Grill Edited");
      expect(edited.value.sections[0].items[0].price).toBe("$15.50");
      expect(layoutSvg(edited.value)).toContain("Casa Mesa Cantina &amp; Grill Edited");
      expect(layoutSvg(edited.value)).toContain("$15.50");
      expect(layoutSvg(edited.value)).toContain("Added special");
    }
    const longItems = Array.from({ length: 8 }, (_, index) => ({
      name: `Long plate ${index + 1}`, price: "$12.00", description: `Description ${index + 1} stays visible`,
    }));
    const longDoc = parseLayout({ ...sampleLayout("menu-promo-67"), title: "A forty character television title ok", sections: [{ name: "Plates", items: longItems }] });
    expect(longDoc.ok).toBe(true);
    if (longDoc.ok) {
      const board = layoutSvg(longDoc.value);
      expect(board).toContain("A forty character television title ok");
      for (const item of longItems) {
        expect(board).toContain(item.name);
        expect(board).toContain(item.description);
      }
      const sizes = [...board.matchAll(/font-size="(\d+)"/g)].map((match) => Number(match[1]));
      expect(Math.max(...sizes)).toBeGreaterThanOrEqual(22);
      const ys = [...board.matchAll(/y="([\d.]+)"/g)].map((match) => Number(match[1]));
      expect(Math.max(...ys)).toBeLessThanOrEqual(1080);
      const dozen = Array.from({ length: 12 }, (_, index) => ({
        name: `Row ${index + 1}`, price: "$4", description: `Line ${index + 1} remains`,
      }));
      const dozenDoc = parseLayout({ ...sampleLayout("menu-promo-67"), sections: [{ name: "All", items: dozen }] });
      expect(dozenDoc.ok).toBe(true);
      if (dozenDoc.ok) {
        const full = layoutSvg(dozenDoc.value);
        for (const item of dozen) expect(full).toContain(item.description);
        const fullYs = [...full.matchAll(/y="([\d.]+)"/g)].map((match) => Number(match[1]));
        expect(Math.max(...fullYs)).toBeLessThanOrEqual(1080);
      }
    }
    const banner = layoutSvg(sampleLayout("menu-banner"));
    const footerAt = banner.indexOf("Members save 10% after 4");
    const footerSlice = banner.slice(Math.max(0, footerAt - 80), footerAt);
    const footerY = Number(footerSlice.match(/y="([\d.]+)"/)?.[1]);
    expect(footerY).toBeLessThan(frameFor("menu-banner", 0.18).video!.y);
    const columnPhoto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const triple = layoutSvg({ ...sampleLayout("triple-column"), imageMediaId: "00000000-0000-4000-8000-000000000002" }, { imageHref: columnPhoto });
    expect(triple.lastIndexOf("<image ")).toBeGreaterThan(triple.indexOf("<rect"));
    const split = layoutSvg(sampleLayout("split-50"));
    expect(split).toContain("Noon ride");
    expect(split).toContain("Studio B");
    const head = split.indexOf("Noon ride");
    const detail = split.indexOf("bikes leave at 12:15");
    const headY = Number(split.slice(Math.max(0, head - 120), head).match(/y="([\d.]+)"/)?.[1]);
    const detailY = Number(split.slice(Math.max(0, detail - 120), detail).match(/y="([\d.]+)"/)?.[1]);
    expect(detailY - headY).toBeGreaterThanOrEqual(60);
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
    expect(composition?.video?.box).toEqual(mediaVideoBox(doc));
    expect(composition?.video?.box.h).toBe(1080 - PROMO_BAND);
    expect(composition).not.toHaveProperty("groupIndex");
    const dashboard = readFileSync("app/dashboard/media/layout-studio/page.tsx", "utf8");
    const dashboardPage = dashboard.slice(dashboard.indexOf("export default"));
    expect(dashboardPage.indexOf("layoutStudioEnabled")).toBeLessThan(dashboardPage.indexOf("<LayoutStudio"));
    expect(dashboard).toContain('mode="account"');
    expect(dashboard).toContain("notFound");
    const menusPage = readFileSync("app/dashboard/media/menus/page.tsx", "utf8");
    expect(menusPage).toContain('"/dashboard/media/layout-studio"');
    expect(menusPage).toContain("layoutStudioEnabled()");
    const publicPage = readFileSync("app/layout-studio/page.tsx", "utf8");
    expect(publicPage).toContain("layoutStudioPreviewOpen");
    expect(publicPage).toContain("notFound");
    const fonts = readFileSync("app/layout-studio/media/font/[name]/route.ts", "utf8");
    expect(fonts).toContain("layoutStudioEnabled()");
    expect(layoutStudioPreviewOpen({ VERCEL_ENV: "production" })).toBe(false);
    expect(layoutStudioPreviewOpen({ VERCEL_ENV: "preview" })).toBe(true);
    expect(layoutStudioPreviewOpen({})).toBe(true);
    expect(layoutStudioEnabled({})).toBe(false);
    expect(layoutStudioEnabled({ LAYOUT_STUDIO: "true" })).toBe(false);
    expect(layoutStudioEnabled({ LAYOUT_STUDIO: "1" })).toBe(true);
  });

  it("keeps the video, the photo, and the promo band on one rectangle", () => {
    const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    for (const template of ["menu-promo-67", "split-50"] as const) {
      const doc = { ...sampleLayout(template), videoMediaId: "00000000-0000-4000-8000-000000000001" };
      const frame = frameFor(template, doc.split);
      const media = mediaVideoBox(doc);
      expect(promoBandHeight(doc)).toBe(PROMO_BAND);
      expect(media).toEqual({ x: frame.video!.x, y: frame.video!.y, w: frame.video!.w, h: frame.video!.h - PROMO_BAND });
      expect(playerComposition(doc, "https://png", "https://mp4")?.video?.box).toEqual(media);
      const drawn = layoutSvg(doc, { imageHref: photo });
      expect(drawn).toContain(`<image href="${photo}" x="${media!.x}" y="${media!.y}" width="${media!.w}" height="${media!.h}"`);
      expect(drawn).not.toContain(`height="${frame.video!.h}" preserveAspectRatio`);
      const empty = { ...doc, featureTitle: "   ", featureDetail: "" };
      expect(promoBandHeight(empty)).toBe(0);
      expect(mediaVideoBox(empty)).toEqual(frame.video);
      const blank = layoutSvg(empty);
      expect(blank).not.toContain("Featured");
      expect(blank).not.toContain(`height="${PROMO_BAND}"`);
    }
  });

  it("gives every column the same type and puts the photo behind the board", () => {
    const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const doc = sampleLayout("triple-column");
    const drawn = layoutSvg(doc, { imageHref: photo });
    expect(drawn).toContain(`<image href="${photo}" x="0" y="0" width="${BOARD_W}" height="${BOARD_H}"`);
    expect(drawn.match(/<image /g)).toHaveLength(1);
    const sizeNear = (label: string) => {
      const index = drawn.indexOf(label);
      return Number(drawn.slice(Math.max(0, index - 180), index).match(/font-size="(\d+)"/)?.[1]);
    };
    const drip = sizeNear("Drip");
    const jasmine = sizeNear("Jasmine");
    const bun = sizeNear("Morning bun");
    expect(drip).toBeGreaterThan(10);
    expect(jasmine).toBe(drip);
    expect(bun).toBe(drip);
  });

  it("draws a changed promo title from a board-sized photo in a few seconds", async () => {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const canvas = createCanvas(4000, 3000);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#c45b2d";
    ctx.fillRect(0, 0, 4000, 3000);
    const raw = canvas.toBuffer("image/jpeg", 90);
    const started = Date.now();
    const fitted = await prepareBoardPhoto(raw, "image/jpeg");
    const png = renderLayoutPng({ ...sampleLayout("split-50"), featureTitle: "Afternoon pour" }, { bytes: fitted.bytes, mime: fitted.mime });
    const elapsed = Date.now() - started;
    console.info(`split-publish-render-ms ${elapsed} raw-bytes ${raw.length} fitted-bytes ${fitted.bytes.length}`);
    expect(elapsed).toBeLessThan(3000);
    expect(Math.max((await loadImage(fitted.bytes)).width, (await loadImage(fitted.bytes)).height)).toBeLessThanOrEqual(1920);
    expect(png.readUInt32BE(16)).toBe(1920);
    expect(png.readUInt32BE(20)).toBe(1080);
    const editor = readFileSync("components/layout-studio.tsx", "utf8");
    expect(editor).toContain("Publishing…");
    expect(editor).toContain("disabled={saving !== null}");
    expect(readFileSync("components/displays-screen.tsx", "utf8")).toContain("already uses this name");
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
    expect(player).toContain("if (zoneVideo(item)) {");
    expect(player).toContain("placeZoneVideo(item, versionOrNull, token, function () {");
    expect(player).toContain("else if (degraded === false) clearReportedError();");
    expect(player).toContain("box.x + box.w > 1920");
    expect(player).toContain("1919x1080 at 0,0 still passes");
    expect(clientAcceptsZoneBox({ x: 0, y: 0, w: 1919, h: 1080 })).toBe(true);
    expect(clientAcceptsZoneBox({ x: 0, y: 0, w: 1920, h: 1080 })).toBe(false);
    for (const template of templates) {
      const safe = frameFor(template, sampleLayout(template).split);
      if (!safe.video) continue;
      expect(clientAcceptsZoneBox(safe.video)).toBe(true);
      expect(boxesOverlap(safe.menu, safe.video)).toBe(false);
    }
    const bannerPhoto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const bannerBoard = layoutSvg(sampleLayout("menu-banner"), { imageHref: bannerPhoto });
    expect(bannerBoard).toContain("<image ");
    expect(bannerBoard.indexOf("<image ")).toBeGreaterThan(bannerBoard.indexOf(`height="${frameFor("menu-banner", 0.18).menu.h}"`));
    const colored = parseLayout({
      ...sampleLayout("menu-promo-67"),
      font: "noto-serif",
      textColor: "#112233",
      backgroundColor: "#f4efe4",
    });
    expect(colored.ok).toBe(true);
    if (colored.ok) {
      const board = layoutSvg(colored.value);
      expect(board).toContain(`font-family="${fontFamily("noto-serif")}"`);
      expect(board).toContain('fill="#112233"');
      expect(board).toContain('fill="#f4efe4"');
      const inter = renderLayoutPng({ ...colored.value, font: "inter" });
      const serif = renderLayoutPng(colored.value);
      expect(Buffer.compare(inter, serif)).not.toBe(0);
      const feature = frameFor("menu-promo-67", colored.value.split).feature;
      const image = layoutSvg(colored.value, { imageHref: bannerPhoto });
      const media = mediaVideoBox(colored.value)!;
      expect(image).toContain(`x="${media.x}" y="${media.y}" width="${media.w}" height="${media.h}" preserveAspectRatio="xMidYMid slice"`);
      expect(media.h).toBe(feature.h - PROMO_BAND);
      expect(media.y + media.h).toBe(feature.y + feature.h - PROMO_BAND);
      const red = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20"><rect width="80" height="20" fill="#ff0000"/></svg>`).render().asPng();
      const signaturePng = renderLayoutPng(sampleLayout("signature"), { bytes: red, mime: "image/png" });
      expect(pngPixel(signaturePng, 140, 420)[0]).toBeLessThan(40);
      expect(pngPixel(signaturePng, 12, 12)[0]).toBeGreaterThan(200);
      const painted = renderLayoutPng(colored.value, { bytes: red, mime: "image/png" });
      expect(painted.readUInt32BE(16)).toBe(1920);
      expect(painted.readUInt32BE(20)).toBe(1080);
      const menuPixel = pngPixel(painted, 120, 420);
      const featurePixel = pngPixel(painted, feature.x + Math.floor(feature.w / 2), 420);
      expect(menuPixel[1]).toBeGreaterThan(180);
      expect(featurePixel[0]).toBeGreaterThan(200);
      expect(featurePixel[1]).toBeLessThan(40);
      const signatureFrame = frameFor("signature", sampleLayout("signature").split);
    const signatureSvg = layoutSvg(sampleLayout("signature"), { imageHref: bannerPhoto });
    expect(signatureSvg).toContain(`<image href="${bannerPhoto}" x="0" y="0" width="1920" height="1080" preserveAspectRatio="xMidYMid slice"/>`);
    expect(signatureSvg.indexOf("<image ")).toBeLessThan(signatureSvg.indexOf(`width="${signatureFrame.menu.w - 96}"`));
    expect(boxesOverlap(signatureFrame.menu, signatureFrame.video!)).toBe(false);
    const columns = frameFor("triple-column", 1 / 3).columns;
    const tripleDoc = parseLayout({
      ...sampleLayout("triple-column"),
      sections: [
        { name: "Coffee only", items: [{ name: "Drip only", price: "$3", description: "Left column" }] },
        { name: "Tea only", items: [{ name: "Mint only", price: "$3", description: "Middle column" }] },
        { name: "Bakery only", items: [{ name: "Bun only", price: "$4", description: "Right column" }] },
      ],
    });
    expect(tripleDoc.ok).toBe(true);
    if (tripleDoc.ok) {
      const tripleSvg = layoutSvg(tripleDoc.value);
      const at = (label: string) => {
        const index = tripleSvg.indexOf(label);
        const found = [...tripleSvg.slice(Math.max(0, index - 220), index).matchAll(/x="([\d.]+)"/g)];
        return Number(found[found.length - 1]?.[1]);
      };
      expect(at("COFFEE ONLY")).toBeGreaterThanOrEqual(columns[0].x);
      expect(at("COFFEE ONLY")).toBeLessThan(columns[1].x);
      expect(at("TEA ONLY")).toBeGreaterThanOrEqual(columns[1].x);
      expect(at("TEA ONLY")).toBeLessThan(columns[2].x);
      expect(at("BAKERY ONLY")).toBeGreaterThanOrEqual(columns[2].x);
    }
    const splitFrame = frameFor("split-50", 0.5);
    const splitDoc = parseLayout({
      ...sampleLayout("split-50"),
      featureTitle: "Right only ride",
      sections: [{ name: "Floor", items: [{ name: "Left only class", price: "6:30", description: "Studio A" }] }],
    });
    expect(splitDoc.ok).toBe(true);
    if (splitDoc.ok) {
      const splitSvg = layoutSvg(splitDoc.value);
      const left = splitSvg.indexOf("Left only class");
      const right = splitSvg.indexOf("Right only ride");
      const xBefore = (svg: string, index: number) => {
        const found = [...svg.slice(Math.max(0, index - 220), index).matchAll(/x="([\d.]+)"/g)];
        return Number(found[found.length - 1]?.[1]);
      };
      const leftX = xBefore(splitSvg, left);
      const rightX = xBefore(splitSvg, right);
      expect(leftX).toBeLessThan(splitFrame.menu.w);
      expect(rightX).toBeGreaterThanOrEqual(splitFrame.feature.x);
      expect(splitSvg.slice(right - 40, right + 20)).not.toContain("Left only");
    }
    const safe = zoneVideoStyle(frameFor("menu-promo-67", 0.67).video!);
      expect(safe.objectFit).toBe("cover");
      expect(safe.left.startsWith("66.")).toBe(true);
      expect(Number(safe.width.replace("%", ""))).toBeLessThan(40);
      const full = Array.from({ length: 4 }, (_, section) => ({
        name: `Section ${section + 1}`,
        items: Array.from({ length: 6 }, (_, item) => ({
          name: `Item ${section + 1}-${item + 1}`,
          price: "$4",
          description: `Line ${section + 1}-${item + 1}`,
        })),
      }));
      const fullDoc = parseLayout({ ...sampleLayout("menu-promo-67"), sections: full });
      expect(fullDoc.ok).toBe(true);
      if (fullDoc.ok) {
        const drawn = layoutSvg(fullDoc.value);
        for (const section of full) {
          expect(drawn).toContain(section.name.toUpperCase());
          for (const item of section.items) {
            expect(drawn).toContain(item.name);
            expect(drawn).toContain(item.description);
          }
        }
        const ys = [...drawn.matchAll(/y="([\d.]+)"/g)].map((match) => Number(match[1]));
        expect(Math.max(...ys)).toBeLessThanOrEqual(1080);
      }
    }
    expect(player).toContain("v.videoWidth > 0 && v.currentTime > 0");
    const editor = readFileSync("components/layout-studio.tsx", "utf8");
    expect(editor).toContain("Each column is 20% to 60%");
    expect(editor).toContain("TV preview");
    expect(editor).toContain("Upload new");
    expect(editor).toContain("Edit feature zone");
    expect(editor).toContain("position: sticky");
    expect(editor).toContain("min-height: 44px");
    const banner = layoutSvg(sampleLayout("menu-banner"));
    expect(banner).toContain("Today's counter");
    const flower = banner.indexOf("Flowers");
    const flowerY = Number(banner.slice(Math.max(0, flower - 160), flower).match(/y="([\d.]+)"/g)?.at(-1)?.match(/[\d.]+/)?.[0]);
    expect(flowerY).toBeGreaterThan(700);
    expect(flowerY).toBeLessThan(frameFor("menu-banner", 0.18).menu.h);
    expect(player).toContain("v.loop = true");
    expect(player).toContain("playsinline");
    expect(player).toContain("webkit-playsinline");
    const tampered = {
      ...sampleLayout("menu-promo-67"),
      videoMediaId: "00000000-0000-4000-8000-000000000099",
      box: { x: 0, y: 0, w: 1919, h: 1080 },
      video: { box: { x: 0, y: 0, w: 1919, h: 1080 } },
    };
    const parsedBox = parseLayout(tampered);
    expect(parsedBox.ok).toBe(true);
    if (parsedBox.ok) {
      expect(parsedBox.value).not.toHaveProperty("box");
      const owned = playerComposition(parsedBox.value, "https://png", "https://mp4");
      expect(owned?.video?.box).toEqual(mediaVideoBox(parsedBox.value));
      expect(owned?.video?.box.w).toBeLessThan(1000);
    }
    const columns = parseLayout({ ...sampleLayout("triple-column"), columnWidths: [0.5, 0.25, 0.25] });
    expect(columns.ok).toBe(true);
    if (columns.ok) {
      const sized = frameFor("triple-column", columns.value.split, columns.value.columnWidths);
      expect(sized.columns[0].w).toBeGreaterThan(sized.columns[1].w);
      expect(sized.video).toBeNull();
    }
    expect(player).toContain("function boardFrame()");
    expect(player).toContain("layer.style.backgroundSize");
    const phone = containedBoard(400, 985);
    expect(phone.left).toBe(0);
    expect(phone.top).toBeGreaterThan(300);
    expect(phone.width).toBeCloseTo(400);
    const promo = frameFor("menu-promo-67", 0.67).video!;
    const placed = zoneOnBoard(400, 985, promo);
    expect(placed.left).toBeGreaterThanOrEqual(phone.left - 0.01);
    expect(placed.left + placed.width).toBeLessThanOrEqual(phone.left + phone.width + 0.01);
    expect(placed.top).toBeGreaterThanOrEqual(phone.top - 0.01);
    expect(placed.top + placed.height).toBeLessThanOrEqual(phone.top + phone.height + 0.01);
    const wide = containedBoard(1920, 800);
    expect(wide.top).toBeCloseTo(0);
    expect(wide.left).toBeGreaterThan(100);
    expect(player).toContain("layout-studio-published-v1");
    expect(player).toContain("if (!zoneVideo(items[startAt])) shownVersion = version;");
    expect(player).toContain("v.muted = true;");
    expect(player).toContain("if (zoneOpen()) return;");
    expect(player).toContain("The video in this board did not start. The still image is showing.");
    expect(player).toContain("if (data.layoutStudio === false) dropZoneCompositions();");
    expect(player).toContain("ZONE_SETTLE_MS");
    expect(player).toContain("scheduleAdvance(index, item);");
    expect(player).toContain("pekkotv.com");
    expect(player).toContain("pantalla-chi.vercel.app");
    expect(player).toContain("/layout-studio/player");
    expect(route).toContain("await attachLayoutCompositions(items);");
    expect(attach).toContain("if (!layoutStudioEnabled()) return;");
    expect(attach).not.toContain("groupIndex");
    expect(attach).not.toContain("groupCount");
  });
});
