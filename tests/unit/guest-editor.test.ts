import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  GUEST_MAX_EDGE, GUEST_MAX_IMAGES, GUEST_MAX_TOTAL_BYTES, downscaleFactor, guestIdsIn, guestMemoryStoreForTests, imageLimitError, isGuestId,
  loadGuestDraft, newGuestId, resetGuestStoreForTests, saveGuestDraft, startGuestDraft, swapGuestIds, clearGuestDraft, GUEST_DRAFT_TTL_MS,
} from "@/lib/guest-draft";
import { guestClaimBody } from "@/lib/guest-claim";
import { createMenuHref, guestEditorEnabled } from "@/lib/guest-editor-flag";
import { AD_PLATFORM_MAP } from "@/lib/conversion-events";
import { FUNNEL_EVENTS, GUEST_ACTIONS, reduceFunnelEvent } from "@/lib/funnel";
import { designById, designDocument } from "@/lib/menu-designs";
import { designSvgWithReport, safeDesignHref } from "@/lib/menu-design-svg";
import { safeImageHref } from "@/lib/layout-studio";
import { resumePath } from "@/components/guest/guest-claim";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

const read = (p: string) => readFileSync(p, "utf8");
const doc = () => designDocument(designById("taqueria-specials")!);

describe("GUEST_EDITOR flag (one-variable rollback)", () => {
  it("is off unless set to on, and the CTAs follow it", () => {
    expect(guestEditorEnabled({})).toBe(false);
    expect(guestEditorEnabled({ GUEST_EDITOR: "off" })).toBe(false);
    expect(guestEditorEnabled({ GUEST_EDITOR: " ON " })).toBe(true);
    expect(createMenuHref({})).toBe("/signup");
    expect(createMenuHref({ GUEST_EDITOR: "on" })).toBe("/create");
  });
  it("/create and /dashboard/claim are 404 while it's off", () => {
    expect(read("app/create/page.tsx")).toMatch(/if \(!guestEditorEnabled\(\)\) notFound\(\)/);
    expect(read("app/dashboard/claim/page.tsx")).toMatch(/if \(!guestEditorEnabled\(\)\) notFound\(\)/);
    expect(read("app/api/guest/claim/route.ts")).toMatch(/if \(!guestEditorEnabled\(\) \|\| !layoutStudioEnabled\(\)\) return fail\("Not found", 404\)/);
  });
  it("every Peek marketing trial CTA uses createMenuHref (Choose plan still goes to billing)", () => {
    for (const f of ["components/site/peek/home-peek.tsx", "components/site/peek/sections.tsx", "components/site/peek/pages.tsx", "components/site/peek/shell.tsx"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/href=\{SIGNUP_HREF\}/);
      expect(src, f).toContain("createMenuHref");
    }
    expect(read("components/site/peek/sections.tsx")).toContain('href="/dashboard/billing"');
  });
});

describe("guest draft (browser storage)", () => {
  afterEach(() => resetGuestStoreForTests());

  it("guest ids are recognisable and never look like account media ids", () => {
    const id = newGuestId();
    expect(isGuestId(id)).toBe(true);
    expect(isGuestId("2b6d0a3e-6a0e-4d5d-8b42-1f1f1f1f1f1f")).toBe(false);
  });

  it("finds every guest photo a menu uses and swaps them for uploaded ids", () => {
    const d = doc();
    const photo = newGuestId(), logo = newGuestId(), item = newGuestId(), missing = newGuestId();
    d.imageMediaId = photo;
    d.logoMediaId = logo;
    (d.sections[0].items[0] as { imageMediaId?: string }).imageMediaId = item;
    (d.sections[0].items[1] as { imageMediaId?: string }).imageMediaId = missing;
    expect(guestIdsIn(d).sort()).toEqual([photo, logo, item, missing].sort());
    const swapped = swapGuestIds(d, { [photo]: "m-photo", [logo]: "m-logo", [item]: "m-item" });
    expect(swapped.imageMediaId).toBe("m-photo");
    expect(swapped.logoMediaId).toBe("m-logo");
    expect((swapped.sections[0].items[0] as { imageMediaId?: string }).imageMediaId).toBe("m-item");
    // A photo that never uploaded is removed, not left pointing at nothing.
    expect("imageMediaId" in swapped.sections[0].items[1]).toBe(false);
    expect(JSON.stringify(swapped)).not.toContain("guest:");
  });

  it("limits: 12 photos, 30 MB in total, longest side 2400 px", () => {
    expect(GUEST_MAX_IMAGES).toBe(12);
    expect(GUEST_MAX_TOTAL_BYTES).toBe(30 * 1024 * 1024);
    expect(imageLimitError([], 1000)).toBeNull();
    expect(imageLimitError(Array.from({ length: 12 }, () => ({ size: 1 })), 1)).toBe("count");
    expect(imageLimitError([{ size: GUEST_MAX_TOTAL_BYTES - 10 }], 11)).toBe("total");
    expect(downscaleFactor(6000, 4000)).toBeCloseTo(GUEST_MAX_EDGE / 6000);
    expect(downscaleFactor(1200, 800)).toBe(1);
  });

  it("saves, restores, and keeps the draft until it is explicitly cleared", async () => {
    resetGuestStoreForTests(guestMemoryStoreForTests());
    const d = await startGuestDraft(doc(), "Casa Lupita", "demo");
    expect(d.draftId).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    await saveGuestDraft({ ...d, name: "Casa Lupita Grill", intent: "display" });
    const back = await loadGuestDraft();
    expect(back?.name).toBe("Casa Lupita Grill");
    expect(back?.intent).toBe("display");
    expect(back?.draftId).toBe(d.draftId);
    await clearGuestDraft();
    expect(await loadGuestDraft()).toBeNull();
  });

  it("discards drafts older than 30 days", async () => {
    resetGuestStoreForTests(guestMemoryStoreForTests());
    await startGuestDraft(doc(), "Old", "cta");
    expect(await loadGuestDraft(Date.now() + GUEST_DRAFT_TTL_MS + 1000)).toBeNull();
  });

  it("only the claim page clears the draft, after the server confirms", () => {
    const callers = ["components/guest/guest-create.tsx", "components/guest/guest-auth-sheet.tsx", "components/menu-templates.tsx", "components/site/marketing/home-b-client.tsx"];
    for (const f of callers) expect(read(f), f).not.toContain("clearGuestDraft");
    const claim = read("components/guest/guest-claim.tsx");
    expect(claim.indexOf("clearGuestDraft()")).toBeGreaterThan(claim.indexOf("menuId = body.menuId"));
  });
});

describe("guest photos draw in the browser preview only", () => {
  it("renderers accept same-page blob: URLs and still refuse other schemes", () => {
    const blob = "blob:https://pekkotv.com/0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(safeDesignHref(blob)).toBe(blob);
    expect(safeImageHref(blob)).toBe(blob);
    for (const bad of ["blob:https://pekkotv.com/x\" onload=\"alert(1)", "javascript:alert(1)", "http://example.com/a.jpg", "blob:file:///etc/passwd"]) {
      expect(safeDesignHref(bad), bad).toBeNull();
      expect(safeImageHref(bad), bad).toBeNull();
    }
  });
  it("an item photo kept in the browser appears on the board", () => {
    const d = doc();
    const id = newGuestId();
    (d.sections[0].items[0] as { imageMediaId?: string }).imageMediaId = id;
    const blob = "blob:http://localhost:3000/0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(designSvgWithReport(d, { imageHref: null, logoHref: null, itemImages: { [id]: blob } }).svg).toContain(`href="${blob}"`);
  });
});

describe("POST /api/guest/claim body", () => {
  it("needs a draft id and a menu, and refuses menus that still point at browser photos", () => {
    expect(guestClaimBody(null).ok).toBe(false);
    expect(guestClaimBody({ draftId: "x", document: {} }).ok).toBe(false);
    expect(guestClaimBody({ draftId: "abcd-1234-efgh", document: [] }).ok).toBe(false);
    const withGuest = { ...doc(), imageMediaId: newGuestId() };
    expect(guestClaimBody({ draftId: "abcd-1234-efgh", name: "A", document: withGuest }).ok).toBe(false);
    const ok = guestClaimBody({ draftId: "abcd-1234-efgh", name: "x".repeat(200), document: doc() });
    expect(ok.ok && ok.value.name.length).toBe(80);
  });
  it("saves a DRAFT with the normal checks (sign-in, plan, layout, photo ownership), once per draft", () => {
    const route = read("app/api/guest/claim/route.ts");
    expect(route).toContain("requireAdmin(req)");
    expect(route).toContain("rejectSubscriptionWrite(admin.accountId, req)");
    expect(route).toContain('mode: "draft"');
    expect(route).toContain("enforceLimit(");
    expect(route).not.toMatch(/mode: "publish"/);
    expect(route.indexOf('claims.insert(')).toBeLessThan(route.indexOf("saveLayoutForAccount("));
  });
});

describe("resume after sign-up", () => {
  it("continues the chosen action", () => {
    expect(resumePath("display", "m1")).toBe("/dashboard/screens/add?menu=m1");
    expect(resumePath("save", "m1")).toBe("/dashboard/media/menus?board=m1");
    expect(resumePath("share", "m1")).toContain("board=m1");
    expect(resumePath(null, "m1")).toBe("/dashboard/media/menus?board=m1");
  });
  it("the claim page is a dashboard path, so sign-in and email links may return to it", async () => {
    const { safeDashboardNext } = await import("@/lib/safe-next");
    const { safeAuthNext } = await import("@/lib/auth-confirm");
    for (const a of GUEST_ACTIONS) {
      expect(safeDashboardNext(`/dashboard/claim?intent=${a}`)).toBe(`/dashboard/claim?intent=${a}`);
      expect(safeAuthNext(`https://pekkotv.com/dashboard/claim?intent=${a}`)).toBe(`/dashboard/claim?intent=${a}`);
    }
  });
});

describe("funnel events and ad-platform mapping", () => {
  it("the counter accepts the guest steps with fixed details only", () => {
    expect(FUNNEL_EVENTS).toEqual(expect.arrayContaining(["guest_open", "guest_edit", "guest_preview", "guest_action", "signup_prompt"]));
    expect(reduceFunnelEvent({ event: "guest_action", detail: "display" })).toEqual({ event: "guest_action", detail: "display" });
    expect(reduceFunnelEvent({ event: "guest_action", detail: "Casa Lupita" })).toBeNull();
    expect(reduceFunnelEvent({ event: "signup_prompt", detail: "save" })).not.toBeNull();
  });
  it("showing the sign-up sheet is never a Lead; prompts, attempts, completions and engagement are distinct", () => {
    expect(AD_PLATFORM_MAP.registration_prompted.meta).toBeNull();
    expect(AD_PLATFORM_MAP.registration_started.meta).toBeNull();
    expect(AD_PLATFORM_MAP.registration_completed.meta).toBe("CompleteRegistration");
    expect(AD_PLATFORM_MAP.guest_customization_started.custom).toBe(true);
    const leads = Object.entries(AD_PLATFORM_MAP).filter(([, v]) => v.meta === "Lead").map(([k]) => k);
    expect(leads).toEqual(["guest_draft_migrated"]);
  });
  it("no Meta pixel is assumed: nothing calls fbq", () => {
    for (const f of ["lib/conversion-events.ts", "components/guest/guest-create.tsx", "components/guest/guest-auth-sheet.tsx", "components/guest/guest-claim.tsx"]) {
      expect(read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), f).not.toMatch(/fbq\(/);
    }
  });
});

describe("guest copy", () => {
  it("every guest string has Spanish, and the hero line is the approved wording", () => {
    const keys = Object.keys(en).filter((k) => k.startsWith("guest.") || ["home2.startLine", "home2.hwLead", "home2.hwBody"].includes(k));
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) expect((es as Record<string, string>)[k], k).toBeTruthy();
    expect(en["home2.startLine"]).toBe("No account or credit card required to start creating.");
    // No pricing or trial terms in the primary creation CTA area.
    expect(en["home2.startLine"]).not.toMatch(/trial|\$|day/i);
  });
});
