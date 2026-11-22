import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import {
  V2_OPTIONAL, V2_REQUIRED, V2_STEP_IDS, RECORDABLE_STEPS, buildV2State, hasSecondContentChange, isRecordableStep,
  isRenderedFileName, isUsableUpload, menuHasUsableContent, menuIsCustomized,
} from "@/lib/onboarding";

const base = { live: {}, confirmed: false, dismissed: false, completedAt: null, legacyFinished: false, celebratedAt: null, previewTarget: null };

describe("onboarding v2 step ids", () => {
  it("has five required and three optional steps, in menu-first order", () => {
    expect([...V2_STEP_IDS]).toEqual(["first_menu", "preview_menu", "customize_menu", "screen", "show_on_tv", "first_update", "playlists", "schedules"]);
    expect([...V2_REQUIRED].sort()).toEqual(["first_menu", "first_update", "preview_menu", "screen", "show_on_tv"]);
    expect([...V2_OPTIONAL]).toEqual(["customize_menu", "playlists", "schedules"]);
    expect(RECORDABLE_STEPS.every((s) => isRecordableStep(s))).toBe(true);
    expect(isRecordableStep("first_menu")).toBe(false);
    expect(isRecordableStep("show_on_tv")).toBe(false);
  });
});

describe("step 1: what counts as a first menu", () => {
  it("a board with at least one named item, or featured media; drafts count", () => {
    expect(menuHasUsableContent({ sections: [{ name: "", items: [{ name: "Coffee", price: "" }] }] })).toBe(true);
    expect(menuHasUsableContent({ title: "", sections: [], imageMediaId: "m1" })).toBe(true);
    expect(menuHasUsableContent({ sections: [], videoMediaId: "v1" })).toBe(true);
    expect(menuHasUsableContent({ sections: [], photoMediaId: "p1" })).toBe(true);
  });
  it("not a title-only, blank or malformed board", () => {
    expect(menuHasUsableContent({ title: "Taqueria", sections: [] })).toBe(false);
    expect(menuHasUsableContent({ sections: [{ name: "Tacos", items: [{ name: "   " }] }] })).toBe(false);
    expect(menuHasUsableContent({ sections: "x" })).toBe(false);
    expect(menuHasUsableContent(null)).toBe(false);
    expect(menuHasUsableContent([])).toBe(false);
    expect(menuHasUsableContent({ imageMediaId: "  " })).toBe(false);
  });
  it("a finished top-level upload, not server stills, slides, converting or failed files", () => {
    expect(isUsableUpload({ file_name: "menu.jpg" })).toBe(true);
    expect(isUsableUpload({ file_name: "promo.mp4", processing_status: "ready" })).toBe(true);
    expect(isUsableUpload({ file_name: "Lunch (menu).png" })).toBe(false);
    expect(isUsableUpload({ file_name: "Sale (promo).png" })).toBe(false);
    expect(isUsableUpload({ file_name: "slide 1.png", source_media_id: "deck" })).toBe(false);
    expect(isUsableUpload({ file_name: "clip.mov", processing_status: "processing" })).toBe(false);
    expect(isUsableUpload({ file_name: "deck.pptx", processing_status: "failed" })).toBe(false);
    expect(isRenderedFileName("My (menu).png.jpg")).toBe(false);
  });
  it("the migration backfill uses the same rules", () => {
    const sql = readFileSync("supabase/migrations/0036_onboarding_milestones.sql", "utf8");
    expect(sql).toContain(`'$.sections[*].items[*].name ? (@ like_regex "[^ ]")'`);
    expect(sql).toContain("m.file_name !~ ' \\((menu|promo)\\)\\.png$'");
    expect(sql).toContain("(m.processing_status is null or m.processing_status = 'ready')");
    for (const k of ["imageMediaId", "videoMediaId", "photoMediaId"]) expect(sql).toContain(`mn.content->>'${k}'`);
  });
});

describe("optional and later steps", () => {
  it("customization means guided custom settings or own colours", () => {
    expect(menuIsCustomized({ custom: { v: 1, textScale: 1.1 } })).toBe(true);
    expect(menuIsCustomized({ custom: { v: 1 } })).toBe(false);
    expect(menuIsCustomized({ accentColor: "#f00" })).toBe(true);
    expect(menuIsCustomized({})).toBe(false);
  });
  it("first update needs a second change on the same screen", () => {
    expect(hasSecondContentChange(["a", "b"])).toBe(false);
    expect(hasSecondContentChange(["a", "b", "a"])).toBe(true);
    expect(hasSecondContentChange([null, null])).toBe(false);
  });
});

describe("buildV2State", () => {
  it("a stamped milestone stays done even when the live data is gone (never revoked)", () => {
    const s = buildV2State({ ...base, milestones: { first_menu: "2026-11-20T10:00:00.000Z" }, live: { first_menu: false } });
    expect(s.steps[0]).toMatchObject({ id: "first_menu", done: true, doneAt: "2026-11-20T10:00:00.000Z" });
  });
  it("the success card shows once, only with milestones on, and never for a dismissed checklist", () => {
    const m = { first_menu: "2026-11-20T10:00:00.000Z" };
    expect(buildV2State({ ...base, milestones: m }).showFirstSuccess).toBe(true);
    expect(buildV2State({ ...base, milestones: m, celebratedAt: "2026-11-20T11:00:00.000Z" }).showFirstSuccess).toBe(false);
    expect(buildV2State({ ...base, milestones: m, dismissed: true }).showFirstSuccess).toBe(false);
    expect(buildV2State({ ...base, milestones: null, live: { first_menu: true } }).showFirstSuccess).toBe(false);
  });
  it("finished: completed_at, the v1 rule, or all five required steps; optional steps never matter", () => {
    expect(buildV2State({ ...base, milestones: {}, completedAt: "2026-11-01T00:00:00.000Z" })).toMatchObject({ finished: true, show: false });
    expect(buildV2State({ ...base, milestones: {}, legacyFinished: true })).toMatchObject({ finished: true, show: false });
    const req = Object.fromEntries(V2_REQUIRED.map((id) => [id, true]));
    const s = buildV2State({ ...base, milestones: {}, live: req });
    expect(s).toMatchObject({ finished: true, requiredCompleted: 5, completed: 5, total: 8 });
    const optionalOnly = buildV2State({ ...base, milestones: {}, live: { customize_menu: true, playlists: true, schedules: true } });
    expect(optionalOnly).toMatchObject({ finished: false, requiredCompleted: 0, nextStep: "first_menu" });
  });
  it("dismissed hides the checklist but keeps progress", () => {
    const s = buildV2State({ ...base, milestones: { screen: "2026-11-20T10:00:00.000Z" }, dismissed: true });
    expect(s).toMatchObject({ dismissed: true, show: false, requiredCompleted: 1 });
  });
  it("without the 0036 columns, preview follows first menu so nobody gets stuck", () => {
    const s = buildV2State({ ...base, milestones: null, live: { first_menu: true } });
    expect(s.steps.find((x) => x.id === "preview_menu")?.done).toBe(true);
  });
  it("nextStep is advisory: the first required step not done, TV pairing allowed in any order", () => {
    const s = buildV2State({ ...base, milestones: { screen: "2026-11-20T10:00:00.000Z" } });
    expect(s.nextStep).toBe("first_menu");
    expect(s.steps.find((x) => x.id === "screen")?.done).toBe(true);
  });
  it("show_on_tv carries the TV confirmation", () => {
    const s = buildV2State({ ...base, milestones: {}, live: { show_on_tv: true }, confirmed: true });
    expect(s.steps.find((x) => x.id === "show_on_tv")).toMatchObject({ done: true, confirmed: true });
  });
});

describe("EN/ES parity for onboarding v2 copy", () => {
  const keys = (Object.keys(en) as (keyof typeof en)[]).filter((k) => k.startsWith("setup.v2."));
  it("every step has a title, body and action in both languages", () => {
    for (const id of V2_STEP_IDS) for (const part of ["title", "body", "action"]) {
      expect(keys, `${id}.${part}`).toContain(`setup.v2.${id}.${part}`);
    }
    for (const k of keys) {
      expect(es[k], k).toBeTruthy();
      expect(es[k], k).not.toBe(en[k]);
    }
  });
  it("uses the agreed CTA wording", () => {
    expect(en["setup.v2.first_menu.action"]).toBe("Create my menu");
    expect(en["setup.v2.first_menu.altAction"]).toBe("Already have a menu? Upload it instead.");
    expect(es["setup.v2.first_menu.action"]).toBe("Crear mi menú");
    expect(es["setup.v2.success.title"]).toBe("¡Su primer menú está listo!");
    expect(en["setup.v2.optional"]).toBe("Optional");
    expect(es["setup.v2.optional"]).toBe("Opcional");
  });
});

describe("developer analytics: onboarding funnel (aggregates only)", async () => {
  const { onboardingFunnel } = await import("@/lib/server/dev-analytics/metrics");
  const at = (h: number) => new Date(Date.parse("2026-11-01T00:00:00Z") + h * 3_600_000).toISOString();
  const cohort = Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, created_at: at(0) }));
  const rows = [
    ...[0, 1, 2, 3].map((i) => ({ id: `a${i}`, onboarding_milestones: { first_menu: at(1), preview_menu: at(1), screen: at(5), show_on_tv: at(6) }, onboarding_completed_at: null })),
    ...[4, 5, 6].map((i) => ({ id: `a${i}`, onboarding_milestones: { screen: at(1), first_menu: at(2) }, onboarding_completed_at: null })),
    { id: "a7", onboarding_milestones: { schedules: at(3) }, onboarding_completed_at: null },
  ];
  const ob = onboardingFunnel(cohort, rows, (id) => id === "a0" || id === "a1" || id === "a2");
  it("counts steps per cohort and hides groups under three", () => {
    expect(ob.cohort).toBe(8);
    expect(ob.steps.find((s) => s.key === "first_menu")?.reached).toBe(7);
    expect(ob.steps.find((s) => s.key === "schedules")?.reached).toBeNull(); // 1 account: hidden
    expect(ob.steps.find((s) => s.key === "customize_menu")?.reached).toBe(0);
    expect(ob.completed).toBe(0);
  });
  it("menu-first share, timings, and paid split", () => {
    expect(ob.contentBeforeTv).toBeCloseTo(4 / 7);
    expect(ob.timeToFirstContent.accounts).toBe(7);
    expect(ob.contentToTv).toMatchObject({ accounts: 4, medianHours: 5 });
    expect(ob.paidContentFirst).toBeCloseTo(3 / 4);
    expect(ob.paidTvFirst).toBe(0); // 0 of 3: a zero is shown, a group of 1-2 is hidden
  });
});
