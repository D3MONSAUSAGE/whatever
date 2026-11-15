import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { makeT } from "@/lib/i18n/index";
import { overnightMessage, pastRangeMessage } from "@/lib/schedule-checks";
import { priceHint, sectionLimitMessage } from "@/lib/menu-fields";
import { placeholderFields, samplePromo, PROMO_TEMPLATES } from "@/lib/promo-templates";
import { selectedFilename } from "@/lib/file-upload";
import { uploadSuccessCopy } from "@/lib/upload-notice";

const ES_RULES = /\b(tú|tu cuenta|tienes|puedes|quieres|elige|escribe|ingresa)\b|televisor|prueba gratuita|desconectad|programación|Inténtelo|Ingrese/i;
const esT = makeT("es");
const enT = makeT("en");

// Every prefix added by I18N-3 (editor chrome only).
const PREFIXES = ["bk.", "sched.", "day.", "dp.", "diu.", "dup.", "fu.", "sos.", "lg.", "mif.", "ed.", "mb.", "pl.", "sv.", "hub.", "cnav.", "cp.", "mf.", "ce.", "tpl.", "ls.", "zone.", "font.", "ml.", "up.", "pd.", "pe.", "ss.", "ps.", "ptpl.", "promo.field."];
const keys = (Object.keys(en) as (keyof typeof en)[]).filter((k) => PREFIXES.some((p) => k.startsWith(p)));
// Same in both languages on purpose: loan words and format strings.
const SAME = new Set(["cp.filter.video", "cp.type.video", "fu.video.accept", "ls.video", "zone.banner", "zone.video", "ml.videos", "ml.video", "pe.video", "ptpl.happy.name"]);

describe("I18N-3: dictionaries", () => {
  it("covers the editor screens with Spanish in usted, following the glossary", () => {
    expect(keys.length).toBeGreaterThan(900);
    for (const k of keys) {
      expect(es[k], k).toBeTruthy();
      expect(es[k], k).not.toMatch(ES_RULES);
      if (!SAME.has(k)) expect(es[k], k).not.toBe(en[k]);
      if (en[k].includes("Pekko")) expect(es[k], k).toContain("Pekko");
    }
  });
  it("keeps the same {placeholders} in both languages", () => {
    for (const k of keys) expect(es[k].match(/\{\w+\}/g)?.sort(), k).toEqual(en[k].match(/\{\w+\}/g)?.sort());
  });
  it("uses the glossary terms", () => {
    expect(es["ss.playlist"]).toBe("Lista de reproducción");
    expect(es["ps.eyebrow"]).toBe("Archivos");
    expect(es["ss.title"]).toBe("Horarios");
    expect(es["ps.template"]).toBe("Plantilla");
    expect(es["ps.makeBoard"]).toContain("menú digital");
    expect(es["ed.remove"]).toMatch(/^Quitar/);
    expect(es["ed.delete"]).toMatch(/^Eliminar/);
    expect(es["ed.offline"].toLowerCase()).toBe("sin conexión");
  });
  it("has no HTML entities, which would show literally through t()", () => {
    for (const k of keys) {
      expect(en[k], k).not.toMatch(/&(amp|apos|quot|lt|gt);/);
      expect(es[k], k).not.toMatch(/&(amp|apos|quot|lt|gt);/);
    }
  });
});

describe("I18N-3: helpers speak the editor language and default to English", () => {
  it("schedule checks", () => {
    expect(overnightMessage("22:00", "02:00")).toBe(overnightMessage("22:00", "02:00", enT));
    expect(overnightMessage("22:00", "02:00", esT)).not.toBe(overnightMessage("22:00", "02:00"));
    expect(overnightMessage("22:00", "02:00", esT)).not.toMatch(ES_RULES);
    expect(pastRangeMessage("2020-01-01", esT)).not.toBe(pastRangeMessage("2020-01-01"));
    expect(readFileSync("components/schedule-screen.tsx", "utf8")).toContain("findOverlaps(schedule, schedules, groups, undefined, t)");
  });
  it("menu field messages", () => {
    expect(priceHint("abc", esT)).not.toBe(priceHint("abc"));
    const full = Array.from({ length: 6 }, (_, i) => ({ name: `S${i}`, items: [{ name: "x", price: "1" }] }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sectionLimitMessage(full as any, esT)).not.toBe(sectionLimitMessage(full as any));
  });
  it("uploads", () => {
    expect(uploadSuccessCopy(2, "image", esT)).not.toBe(uploadSuccessCopy(2, "image"));
    const files = [new File(["a"], "Menú Día.jpg")];
    // File names are customer content: shown as is in both languages.
    expect(selectedFilename(files, esT)).toContain("Menú Día.jpg");
    expect(selectedFilename(files)).toContain("Menú Día.jpg");
  });
  it("promo placeholder field names", () => {
    const content = { ...samplePromo("happy"), headline: "[Your headline]" };
    expect(placeholderFields(content)).toContain("headline");
    expect(placeholderFields(content, esT)).toContain("titular");
  });
});

describe("I18N-3: customer content and slide output stay untouched", () => {
  it("promo slide samples and template data are not translated (they render on the TV)", () => {
    const src = readFileSync("lib/promo-templates.ts", "utf8");
    expect(src).not.toMatch(/sample:[^\n]*\bt\(/);
    expect(PROMO_TEMPLATES.map((p) => p.name)).toEqual(["Happy hour", "Deal", "Today's special"]);
  });
  it("components show customer names as data, never through t()", () => {
    const files = ["components/schedule-screen.tsx", "components/promo-slides.tsx", "components/playlist-editor.tsx", "components/media-library.tsx", "components/presentation-detail.tsx", "components/classic-editor.tsx", "components/layout-studio.tsx"];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/useT\(\)|useLocale\(\)/);
      expect(src, f).not.toMatch(/\bt\((\w+\.)?(name|fileName|title|price|label)\)/);
      expect(src, f).not.toMatch(/\bt\(`\$\{/);
    }
  });
  it("existing names are never renamed; generated defaults follow the editor language at creation only", () => {
    const boards = readFileSync("components/menu-boards.tsx", "utf8");
    expect(boards).toContain('name: t("mb.defaultName")');
    expect(en["mb.defaultName"]).toBe("Lunch menu");
    const promos = readFileSync("components/promo-slides.tsx", "utf8");
    expect(promos).toContain('setDraft({ id: match.id, name: match.name');
    expect(promos).toContain("name: t(`ptpl.${template}.name`)");
  });
  it("does not touch the player, renderers, server routes or TV layouts", () => {
    let changed: string[] = [];
    try {
      changed = execSync("git diff --name-only 03a1292 -- .", { encoding: "utf8" }).split("\n").filter(Boolean);
    } catch {
      return; // no git history in this environment
    }
    for (const f of changed) {
      expect(f, f).not.toMatch(/^(public\/|app\/api\/|lib\/server\/|app\/player|app\/tv)|render|menu-templates|layout-studio\.ts$|board-fonts/);
    }
  });
});
