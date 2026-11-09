import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyLayoutSave, boardSaveEffect, libraryError, storedMenuTemplate, type LibraryFile } from "@/lib/layout-publish";
import { sampleLayout } from "@/lib/layout-studio";

const account = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const photo = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const video = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function files(): LibraryFile[] {
  return [
    { id: photo, accountId: account, mime: "image/jpeg", kind: "image" },
    { id: video, accountId: account, mime: "video/mp4", kind: "video" },
  ];
}

describe("layout save", () => {
  it("keeps a draft off screens and publishes through the existing swap", async () => {
    expect(boardSaveEffect("draft")).toEqual({ writeContent: true, renderPng: true, swapMedia: false, bumpScreens: false });
    expect(boardSaveEffect("publish").swapMedia).toBe(true);
    const doc = { ...sampleLayout("menu-promo-67"), imageMediaId: photo, videoMediaId: video };
    const calls: string[] = [];
    const draft = await applyLayoutSave({
      enabled: true, accountId: account, mode: "draft", document: doc, files: files(), previousMediaId: null,
    }, {
      writeContent: async () => { calls.push("write"); },
      render: async () => { calls.push("render"); return "new"; },
      swap: async () => { calls.push("swap"); },
      preview: async () => { calls.push("preview"); },
    });
    expect(draft.ok).toBe(true);
    expect(calls).toEqual(["write", "render", "preview"]);
    if (draft.ok) {
      expect(draft.swapped).toBe(false);
      expect(draft.document.sections).toEqual(doc.sections);
      expect(storedMenuTemplate(draft.document)).toBe("fresh");
    }
    calls.length = 0;
    const published = await applyLayoutSave({
      enabled: true, accountId: account, mode: "publish", document: doc, files: files(), previousMediaId: "old",
    }, {
      writeContent: async () => { calls.push("write"); },
      render: async () => { calls.push("render"); return "png"; },
      swap: async (previous, next) => { calls.push(`swap:${previous}:${next}`); },
    });
    expect(published.ok).toBe(true);
    expect(calls).toEqual(["write", "render", "swap:old:png"]);
  });

  it("refuses another account's media and stays off when the flag is off", async () => {
    const doc = { ...sampleLayout("split-50"), videoMediaId: video };
    const foreign = files().map((file) => file.id === video ? { ...file, accountId: other } : file);
    const refused = await applyLayoutSave({
      enabled: true, accountId: account, mode: "publish", document: doc, files: foreign, previousMediaId: null,
    }, { writeContent: async () => { throw new Error("wrote"); }, render: async () => "x", swap: async () => undefined });
    expect(refused.ok).toBe(false);
    const off = await applyLayoutSave({
      enabled: false, accountId: account, mode: "draft", document: doc, files: files(), previousMediaId: null,
    }, { writeContent: async () => { throw new Error("wrote"); }, render: async () => "x", swap: async () => undefined });
    expect(off).toEqual({ ok: false, error: "Layout Studio is not on." });
    expect(libraryError(account, null, "photo")).toMatch(/media library/);
    const route = readFileSync("app/api/layout-studio/route.ts", "utf8");
    const handler = route.slice(route.indexOf("export async function POST"));
    expect(handler.indexOf("layoutStudioEnabled")).toBeLessThan(handler.indexOf("requireAdmin"));
  });
});
