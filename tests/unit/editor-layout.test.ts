import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultEditorLayout, parseEditorLayout, resolveEditorLayout, EDITOR_LAYOUT_KEY } from "@/lib/editor-layout";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

const studio = () => readFileSync("components/layout-studio.tsx", "utf8");
const classic = () => readFileSync("components/classic-editor.tsx", "utf8");
const chrome = () => readFileSync("components/studio-chrome.tsx", "utf8");

describe("menu-board editor layout: default and rollback", () => {
  it("uses the new layout by default, with an environment rollback and a per-browser override", () => {
    expect(defaultEditorLayout(undefined)).toBe("v2");
    expect(defaultEditorLayout("classic")).toBe("classic");
    expect(resolveEditorLayout("", null, "v2")).toBe("v2");
    expect(resolveEditorLayout("", null, "classic")).toBe("classic");
    expect(resolveEditorLayout("?editor=classic", null, "v2")).toBe("classic");
    expect(resolveEditorLayout("", "classic", "v2")).toBe("classic");
    expect(resolveEditorLayout("?editor=v2", "classic", "classic")).toBe("v2");
    expect(resolveEditorLayout("?editor=nope", "junk", "v2")).toBe("v2");
    expect(parseEditorLayout("v3")).toBeNull();
    // New key: a "classic" choice saved by the removed toggle no longer applies.
    expect(EDITOR_LAYOUT_KEY).toBe("pekko_editor_layout_override");
  });

  it("has no customer-facing layout toggle", () => {
    for (const src of [studio(), classic(), chrome()]) {
      expect(src).not.toContain("editor-layout-toggle");
      expect(src).not.toContain("studio-layout-toggle");
    }
    expect(Object.keys(en)).not.toContain("ed2.tryNew");
    expect(Object.keys(en)).not.toContain("ed2.useClassic");
  });
});

describe("menu-board editor refinements", () => {
  it("drops the toolbar Preview button but keeps the TV preview on screen", () => {
    expect(studio()).toContain("{accountMode ? null : renderPreviewButton()}");
    expect(classic()).not.toContain('onClick={goPreview}>{t("ed.preview")}');
    expect(studio()).toContain('data-testid="studio-tv-preview"');
    expect(classic()).toContain('data-testid="studio-tv-preview"');
  });

  it("removes the Images & video accordion and puts a select-an-area instruction above the preview", () => {
    expect(studio()).not.toContain('t("ls.imagesVideo")');
    expect(studio()).toContain('<p className="studio-select-hint" data-testid="studio-select-hint">{t("ed2.selectHint")}</p>');
    expect(classic()).toContain('<p className="studio-select-hint" data-testid="studio-select-hint">{t("ed2.selectHint")}</p>');
    expect(en["ed2.selectHint"]).toBe("Select an area on the board to edit its text, image or video.");
  });

  it("keeps every media control: properties column on wide screens, the editor slot on phones", () => {
    const src = studio();
    expect(src).toContain('{v2 ? (\n          <aside className="studio-props" id="studio-canvas-tools"');
    expect(src).toContain('{editorPlacement === "left" && !v2 ? <div className="studio-editor-slot">{zoneEditor}</div> : null}');
    expect(src).toMatch(/\{studioBp !== "phone" && !v2 \? \(\s*<div className="studio-canvas-tools"/);
    expect(classic()).toMatch(/<aside className="studio-props" id="studio-canvas-tools" aria-label=\{t\("ce.photoControls"\)\} data-testid="studio-props">\s*\{photoPanel\}/);
  });

  it("keeps one Save draft, Preview and Publish wiring and one leave guard", () => {
    const src = studio();
    expect(src.match(/function renderSaveDraft\(\)/g)).toHaveLength(1);
    expect(src.match(/function renderPublish\(\)/g)).toHaveLength(1);
    expect(src).toContain("useRegisterStudioLeave(studioIsDirty);");
    expect(classic()).toContain("useRegisterStudioLeave(isDirty);");
    expect(classic().match(/onClick=\{\(\) => \{ void save\(\); \}\}>\{saveLabel\}/g)).toHaveLength(2);
    expect(classic()).toContain('draft.id ? (editorV2 ? t("ls.publish") : t("ed.saveChanges")) : t("ed.createBoard")');
  });
});

describe("menu-board editor responsive layout", () => {
  it("desktops get three columns; tablets put the board on top with tools and properties below", () => {
    const css = chrome();
    expect(css).toMatch(/@media \(min-width: 1180px\) \{\s*\.studio-v2 \.studio-grid \{ grid-template-columns: 300px minmax\(0, 1fr\) 360px; grid-template-areas: "controls canvas props";/);
    expect(css).toMatch(/@media \(min-width: 861px\) and \(max-width: 1179px\) \{\s*\.studio-v2 \.studio-grid \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\); grid-template-areas: "canvas canvas" "controls props";/);
  });

  it("phones keep the board on top and switch Content, Style and Layout tabs", () => {
    const src = studio();
    expect(src).toContain('const v2m = editorV2 && studioBp === "phone";');
    expect(src).toContain('className={step === "preview" || v2m ? "studio-canvas on" : "studio-canvas"}');
    expect(src).toContain('{(["content", "style", "layout"] as const).map((id) => (');
    expect(src).toContain('setMtab("content");'); // selecting an area opens its controls
    expect(classic()).toContain('{(["content", "style"] as const).map((id) => (');
    const css = chrome();
    expect(css).toContain('.studio-v2m[data-mtab="content"] .studio-panel-layout { display: none; }');
    expect(css).toContain('.studio-v2m:not([data-mtab="content"]) .studio-editor-slot { display: none; }');
  });

  it("has every editor label in both languages", () => {
    for (const k of ["ed2.selectHint", "ed2.unpublished", "ed2.upToDate", "ed2.properties", "ed2.tab.content", "ed2.tab.style", "ed2.tab.layout"] as const) {
      expect(es[k], k).toBeTruthy();
      expect(es[k], k).not.toBe(en[k]);
    }
  });
});
