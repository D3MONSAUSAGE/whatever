import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEditorLayout, resolveEditorLayout, EDITOR_LAYOUT_KEY } from "@/lib/editor-layout";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

describe("redesign phase 3: editor layout flag", () => {
  it("is off by default and opt-in per browser", () => {
    expect(resolveEditorLayout("", null)).toBe("classic");
    expect(resolveEditorLayout("", "v2")).toBe("v2");
    expect(resolveEditorLayout("?editor=v2", null)).toBe("v2");
    expect(resolveEditorLayout("?editor=classic", "v2")).toBe("classic");
    expect(resolveEditorLayout("?editor=nope", "junk")).toBe("classic");
    expect(parseEditorLayout("v3")).toBeNull();
    expect(EDITOR_LAYOUT_KEY).toBe("pekko_editor_layout");
    // Starts false, so server and first client render match.
    expect(readFileSync("lib/editor-layout.ts", "utf8")).toContain("const [on, setOn] = useState(false);");
  });

  it("changes layout only: same save, publish, preview and leave guard in both layouts", () => {
    const src = readFileSync("components/layout-studio.tsx", "utf8");
    expect(src).toContain('const v2 = editorV2 && studioBp !== "phone";');
    // Properties column replaces the left slot and the under-canvas tools only when the flag is on.
    expect(src).toContain('{editorPlacement === "left" && !v2 ? <div className="studio-editor-slot">{zoneEditor}</div> : null}');
    expect(src).toContain('{studioBp !== "phone" && !v2 ? (');
    expect(src).toContain('<aside className="studio-props" id="studio-canvas-tools" aria-label={t("ed2.properties")} data-testid="studio-props">');
    // One set of Save draft / Preview / Publish renderers and one leave-guard registration, whatever the layout.
    expect(src.match(/function renderSaveDraft\(\)/g)).toHaveLength(1);
    expect(src.match(/function renderPublish\(\)/g)).toHaveLength(1);
    expect(src).toContain("useRegisterStudioLeave(studioIsDirty);");
    expect(src).toContain('studioIsDirty() ? t("ed2.unpublished") : t("ed2.upToDate")');
  });

  it("classic boards say Publish in the new layout (D3) with the same save() call", () => {
    const src = readFileSync("components/classic-editor.tsx", "utf8");
    expect(src).toContain('draft.id ? (editorV2 ? t("ls.publish") : t("ed.saveChanges")) : t("ed.createBoard")');
    expect(src.match(/onClick=\{\(\) => \{ void save\(\); \}\}>\{saveLabel\}/g)).toHaveLength(2);
  });

  it("has every new label in both languages", () => {
    for (const k of ["ed2.tryNew", "ed2.useClassic", "ed2.unpublished", "ed2.upToDate", "ed2.properties"] as const) {
      expect(en[k]).toBeTruthy();
      expect(es[k]).toBeTruthy();
      expect(es[k]).not.toBe(en[k]);
    }
  });

  it("puts the properties column in the grid only on tablets and desktops", () => {
    const css = readFileSync("components/studio-chrome.tsx", "utf8");
    expect(css).toContain(".studio-props { display: none; }");
    expect(css).toMatch(/@media \(min-width: 861px\) \{\s*\.studio-v2 \.studio-grid \{ grid-template-columns: minmax\(230px, 280px\) minmax\(0, 1fr\) minmax\(260px, 320px\); grid-template-areas: "controls canvas props";/);
  });
});
