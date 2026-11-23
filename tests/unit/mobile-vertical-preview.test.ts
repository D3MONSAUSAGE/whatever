import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

const src = readFileSync("components/menu-templates.tsx", "utf8");

describe("mobile vertical preview (PAN-19)", () => {
  it("keeps the desktop 75dvh portrait cap and only tightens the editor preview on mobile", () => {
    expect(src).toContain(".tpl-board.is-portrait { aspect-ratio: 9 / 16; width: min(100%, calc(75dvh * 9 / 16)); margin-inline: auto; }");
    expect(src).toContain("@media (min-width: 1100px) { .tpl-grid { grid-template-columns: minmax(360px, 420px) minmax(0, 1fr); align-items: start; } .tpl-preview { position: sticky; top: 72px; grid-column: 2; grid-row: 1; } .tpl-form { grid-column: 1; grid-row: 1; } }");
    expect(src).toContain(".tpl-preview.is-portrait { position: static; z-index: auto; }");
    expect(src).toContain(".tpl-preview.is-portrait .tpl-board.is-portrait");
    expect(src).toContain("width: min(100%, calc(50svh * 9 / 16));");
    expect(src).toContain("max-height: 50svh;");
    expect(src).toContain("width: min(100%, calc(50dvh * 9 / 16));");
    expect(src).toContain("width: min(100%, calc(50vh * 9 / 16));");
    // The cap is scoped to the editor preview, not gallery or "another template" cards.
    expect(src).toContain(".tpl-preview.is-portrait .tpl-board.is-portrait");
    expect(src).not.toMatch(/@media \(max-width: 1099px\) {[^}]*\n\s*\.tpl-board\.is-portrait \{/);
  });

  it("hides Expand preview on desktop and reuses the shared Dialog for the overlay", () => {
    expect(src).toContain(".tpl-expand-preview { display: none; }");
    expect(src).toContain(".tpl-preview.is-portrait .tpl-expand-preview { display: inline-flex;");
    expect(src).toContain('data-testid="tpl-expand-preview"');
    expect(src).toContain('testId="tpl-preview-overlay"');
    expect(src).toContain('data-testid="tpl-preview-close"');
    expect(src).toContain('variant="center" tone="dark"');
    expect(src).toContain("setPreviewExpanded(false)");
  });

  it("adds formal EN/ES copy for expand and close", () => {
    expect(en["tpl.expandPreview"]).toBe("Expand preview");
    expect(en["tpl.closePreview"]).toBe("Close preview");
    expect(es["tpl.expandPreview"]).toBe("Ampliar vista previa");
    expect(es["tpl.closePreview"]).toBe("Cerrar vista previa");
    expect(es["tpl.expandPreview"]).not.toMatch(/\b(tú|puedes|cierra)\b/i);
    expect(es["tpl.closePreview"]).not.toMatch(/\b(tú|cierra)\b/i);
  });
});
