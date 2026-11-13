import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  brandFromRecord,
  brandFromRow,
  brandPatchRow,
  defaultBrandResponse,
  EMPTY_IDENTITY,
  mergeBrandRecord,
  parseBrandPut,
  parseDisplayName,
  parsePhone,
  parseWebsite,
  seedFreshClassicIfClean,
  seedClassicMenu,
  type BrandRecord,
} from "@/lib/brand-kit";
import { sampleLayout, seedBrand } from "@/lib/layout-studio";
import { sampleMenu } from "@/lib/menu-templates";
import { hasUnsavedEdits } from "@/lib/menu-board-unify";

const APPLY_SHA = "677e466cbf7eb6e3983f0a108c510d35e6a94736a0e0e30db3418777eb16bfc3";
const PLAYER_SHA = "091ba06d7c0630ca10d4721ca564058c46cdd282bc54b002e7d44d08170cb69b";

const stored: BrandRecord = {
  primaryColor: "#c8102e",
  accentColor: "#ffd34d",
  logoMediaId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  displayName: "Demo Café",
  textColor: "#1a1a1a",
  backgroundColor: "#f4e8c8",
  headingFont: "noto-serif",
  bodyFont: "inter",
  phone: "(415) 555-0142",
  website: "https://democafe.example",
};

describe("PUT /api/brand merge semantics", () => {
  it("preserves identity fields when an Android-shaped payload sends only colours and the logo", () => {
    const parsed = parseBrandPut({
      primaryColor: "#111111",
      accentColor: "#222222",
      logoMediaId: "11111111-2222-4333-8444-555555555555",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.patch).toEqual({
      primaryColor: "#111111",
      accentColor: "#222222",
      logoMediaId: "11111111-2222-4333-8444-555555555555",
    });
    expect("displayName" in parsed.patch).toBe(false);
    expect("textColor" in parsed.patch).toBe(false);
    expect("website" in parsed.patch).toBe(false);
    const merged = mergeBrandRecord(stored, parsed.patch);
    expect(merged.primaryColor).toBe("#111111");
    expect(merged.accentColor).toBe("#222222");
    expect(merged.logoMediaId).toBe("11111111-2222-4333-8444-555555555555");
    expect(merged.displayName).toBe("Demo Café");
    expect(merged.textColor).toBe("#1a1a1a");
    expect(merged.backgroundColor).toBe("#f4e8c8");
    expect(merged.headingFont).toBe("noto-serif");
    expect(merged.bodyFont).toBe("inter");
    expect(merged.phone).toBe("(415) 555-0142");
    expect(merged.website).toBe("https://democafe.example");
  });

  it("clears a field when the key is present with null, and leaves other fields untouched", () => {
    const parsed = parseBrandPut({ displayName: null, logoMediaId: null, phone: null });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const merged = mergeBrandRecord(stored, parsed.patch);
    expect(merged.displayName).toBeNull();
    expect(merged.logoMediaId).toBeNull();
    expect(merged.phone).toBeNull();
    expect(merged.primaryColor).toBe("#c8102e");
    expect(merged.website).toBe("https://democafe.example");
    expect(merged.headingFont).toBe("noto-serif");
  });

  it("leaves a field untouched when its key is absent", () => {
    const parsed = parseBrandPut({ textColor: "#ffffff" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const merged = mergeBrandRecord(stored, parsed.patch);
    expect(merged.textColor).toBe("#ffffff");
    expect(merged.displayName).toBe("Demo Café");
    expect(merged.primaryColor).toBe("#c8102e");
  });

  it("rejects an empty {} PUT without writing, and Android +13 always sends three keys so it never hits this", () => {
    // Gother: Android +13 always sends {primaryColor, accentColor, logoMediaId}.
    const empty = parseBrandPut({});
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.error).toBe("Change at least one brand field.");
    const android = parseBrandPut({ primaryColor: "#111111", accentColor: "#222222", logoMediaId: null });
    expect(android.ok).toBe(true);
    const unknownOnly = parseBrandPut({ unexpected: true });
    expect(unknownOnly.ok).toBe(false);
  });

  it("treats a present empty string on optional text as a clear", () => {
    const parsed = parseBrandPut({ displayName: "  ", phone: "", website: "   " });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const merged = mergeBrandRecord(stored, parsed.patch);
    expect(merged.displayName).toBeNull();
    expect(merged.phone).toBeNull();
    expect(merged.website).toBeNull();
  });
});

describe("PUT /api/brand validation", () => {
  it("accepts 3-digit hex and stores lowercase 6-digit, and rejects invalid colours including null on required colours", () => {
    const ok = parseBrandPut({ primaryColor: "#C81", accentColor: "#ffd34d", textColor: "#abc" });
    expect(ok).toEqual({
      ok: true,
      patch: { primaryColor: "#cc8811", accentColor: "#ffd34d", textColor: "#aabbcc" },
    });
    expect(parseBrandPut({ primaryColor: "red" }).ok).toBe(false);
    expect(parseBrandPut({ primaryColor: null }).ok).toBe(false);
    expect(parseBrandPut({ accentColor: "" }).ok).toBe(false);
    expect(parseBrandPut({ textColor: "blue" }).ok).toBe(false);
    expect(parseBrandPut({ backgroundColor: "#" }).ok).toBe(false);
  });

  it("limits fonts to the Inter and Noto Serif allowlist the editors already support", () => {
    expect(parseBrandPut({ headingFont: "inter", bodyFont: "noto-serif" })).toEqual({
      ok: true,
      patch: { headingFont: "inter", bodyFont: "noto-serif" },
    });
    expect(parseBrandPut({ headingFont: "roboto" }).ok).toBe(false);
    expect(parseBrandPut({ bodyFont: "comic-sans" }).ok).toBe(false);
    expect(parseBrandPut({ headingFont: null })).toEqual({ ok: true, patch: { headingFont: null } });
    expect(parseBrandPut({ headingFont: "" })).toEqual({ ok: true, patch: { headingFont: null } });
  });

  it("sanitizes a short phone, length-caps display name, and only accepts http(s) websites", () => {
    expect(parsePhone("+1 (415) 555-0142")).toEqual({ ok: true, value: "+1 (415) 555-0142" });
    expect(parsePhone("abc").ok).toBe(false);
    expect(parsePhone("1".repeat(40)).ok).toBe(false);
    expect(parsePhone(null)).toEqual({ ok: true, value: null });
    expect(parseDisplayName("Demo Café")).toEqual({ ok: true, value: "Demo Café" });
    expect(parseDisplayName("x".repeat(81)).ok).toBe(false);
    expect(parseDisplayName("  ").ok).toBe(true);
    expect(parseWebsite("https://democafe.example")).toEqual({ ok: true, value: "https://democafe.example" });
    expect(parseWebsite("http://example.com/path")).toEqual({ ok: true, value: "http://example.com/path" });
    expect(parseWebsite("HTTPS://democafe.example")).toEqual({ ok: true, value: "https://democafe.example" });
    expect(parseWebsite("HTTP://Example.COM/Path")).toEqual({ ok: true, value: "http://Example.COM/Path" });
    expect(parseWebsite("javascript:alert(1)").ok).toBe(false);
    expect(parseWebsite("ftp://example.com").ok).toBe(false);
    expect(parseWebsite("https://user:pass@example.com").ok).toBe(false);
    expect(parseWebsite("https://" + "a".repeat(200)).ok).toBe(false);
    expect(parseBrandPut({ website: "not-a-url" }).ok).toBe(false);
  });
});

describe("GET /api/brand shape is backward compatible", () => {
  it("always includes the original keys with the same types, and adds identity keys (null when unset)", () => {
    const empty = defaultBrandResponse(true);
    expect(empty).toEqual({
      primaryColor: "#0066ff",
      accentColor: "#ffd34d",
      logoMediaId: null,
      available: true,
      custom: false,
      ...EMPTY_IDENTITY,
    });
    expect(typeof empty.primaryColor).toBe("string");
    expect(typeof empty.accentColor).toBe("string");
    expect(typeof empty.custom).toBe("boolean");
    expect(typeof empty.available).toBe("boolean");
    expect(empty.logoMediaId).toBeNull();

    const custom = brandFromRow(
      {
        primary_color: "#c8102e",
        accent_color: "#ffd34d",
        logo_media_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        display_name: "Demo Café",
        text_color: "#1a1a1a",
        background_color: "#f4e8c8",
        heading_font: "noto-serif",
        body_font: "inter",
        phone: "(415) 555-0142",
        website: "https://democafe.example",
      },
      { available: true, custom: true },
    );
    expect(custom.primaryColor).toBe("#c8102e");
    expect(custom.accentColor).toBe("#ffd34d");
    expect(custom.logoMediaId).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(custom.displayName).toBe("Demo Café");
    expect(custom.headingFont).toBe("noto-serif");
    expect(Object.keys(custom).sort()).toEqual([
      "accentColor",
      "available",
      "backgroundColor",
      "bodyFont",
      "custom",
      "displayName",
      "headingFont",
      "logoMediaId",
      "phone",
      "primaryColor",
      "textColor",
      "website",
    ]);

    const legacy = brandFromRow(
      { primary_color: "#0066ff", accent_color: "#ffd34d", logo_media_id: null },
      { available: true, custom: true },
    );
    expect(legacy).toMatchObject({
      primaryColor: "#0066ff",
      accentColor: "#ffd34d",
      logoMediaId: null,
      custom: true,
      available: true,
      ...EMPTY_IDENTITY,
    });

    const fromRecord = brandFromRecord(stored, { available: true, custom: true });
    expect(fromRecord.custom).toBe(true);
    expect(fromRecord.displayName).toBe("Demo Café");
  });
});

describe("seedBrand and seedClassicMenu apply identity only on fresh samples", () => {
  const kit = {
    primaryColor: "#c8102e",
    accentColor: "#ffd34d",
    textColor: "#1a1a1a",
    backgroundColor: "#f4e8c8",
    headingFont: "noto-serif" as const,
    bodyFont: "inter" as const,
    displayName: "Demo Café",
    phone: "(415) 555-0142",
    website: "https://democafe.example",
  };

  it("seeds colours, fonts, title, and footer on a fresh Layout sample", () => {
    const fresh = sampleLayout("menu-promo-67");
    expect(fresh.primaryColor).toBeNull();
    const seeded = seedBrand(fresh, kit);
    expect(seeded).toMatchObject({
      primaryColor: "#c8102e",
      accentColor: "#ffd34d",
      textColor: "#1a1a1a",
      backgroundColor: "#f4e8c8",
      font: "noto-serif",
      title: "Demo Café",
      footer: "(415) 555-0142 · https://democafe.example",
    });
    expect(seeded).not.toBe(fresh);
    expect(fresh.title).not.toBe("Demo Café");
  });

  it("uses bodyFont when headingFont is unset, ignores unknown fonts, and truncates a long display name to the title limit", () => {
    const fresh = sampleLayout("two-column");
    expect(seedBrand(fresh, { headingFont: "roboto", bodyFont: "inter" }).font).toBe("inter");
    expect(seedBrand(fresh, { headingFont: "comic" }).font).toBe("inter"); // sample default stays
    const long = seedBrand(fresh, { displayName: "N".repeat(80) });
    expect(long.title.length).toBe(40);
  });

  it("does not overwrite a document that already has a brand colour", () => {
    const fresh = sampleLayout("menu-promo-67");
    const existing = { ...fresh, primaryColor: "#163628", accentColor: "#f4e8c8", title: "Kept title" };
    expect(seedBrand(existing, kit)).toBe(existing);
    expect(seedBrand(existing, kit).title).toBe("Kept title");
  });

  it("seeds classic title and footer on a fresh sample and leaves an already-titled menu's caller in control", () => {
    const sample = sampleMenu();
    const seeded = seedClassicMenu(sample, kit);
    expect(seeded.title).toBe("Demo Café");
    expect(seeded.footer).toBe("(415) 555-0142 · https://democafe.example");
    expect(seeded).not.toBe(sample);
    expect(sample.title).toBe("Today's menu");
    const custom = { ...sampleMenu(), title: "Dinner", footer: "From 5 PM" };
    const next = seedClassicMenu(custom, kit);
    expect(next.title).toBe("Demo Café"); // the helper itself applies; callers only invoke it on new drafts
    expect(next.footer).toContain("555-0142");
  });
});

describe("PUT writes only the provided columns", () => {
  it("builds a column-only row from an Android-shaped patch, with no identity columns", () => {
    const row = brandPatchRow({
      primaryColor: "#111111",
      accentColor: "#222222",
      logoMediaId: "11111111-2222-4333-8444-555555555555",
    });
    expect(row).toEqual({
      primary_color: "#111111",
      accent_color: "#222222",
      logo_media_id: "11111111-2222-4333-8444-555555555555",
    });
    expect(Object.keys(row).sort()).toEqual(["accent_color", "logo_media_id", "primary_color"]);
  });

  it("includes a present null so that field is cleared, and omits absent keys", () => {
    const row = brandPatchRow({ displayName: null, logoMediaId: null, phone: "(415) 555-0142" });
    expect(row).toEqual({
      display_name: null,
      logo_media_id: null,
      phone: "(415) 555-0142",
    });
    expect("website" in row).toBe(false);
    expect("primary_color" in row).toBe(false);
  });

  it("can omit identity columns when the database has not had 0025 applied", () => {
    const row = brandPatchRow(
      { primaryColor: "#111111", displayName: "Demo Café" },
      { includeIdentity: false },
    );
    expect(row).toEqual({ primary_color: "#111111" });
  });
});

describe("classic late-load seed does not dirty a new editor", () => {
  const kit = {
    displayName: "Demo Café",
    phone: "(415) 555-0142",
    website: "https://democafe.example",
  };

  function freshDraft() {
    const content = sampleMenu();
    const baseline = { name: "Lunch menu", template: "classic" as const, content, displayIds: [] as string[] };
    return {
      draft: { id: null as string | null, name: "Lunch menu", template: "classic" as const, content, displayIds: [] as string[] },
      baseline,
    };
  }

  it("seeds a clean new draft and returns a baseline that matches, so the leave guard stays quiet", () => {
    const { draft, baseline } = freshDraft();
    const result = seedFreshClassicIfClean(draft, kit, baseline);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.draft.content.title).toBe("Demo Café");
    expect(result.draft.content.footer).toBe("(415) 555-0142 · https://democafe.example");
    const current = { name: result.draft.name, template: result.draft.template, content: result.draft.content, displayIds: result.draft.displayIds };
    expect(hasUnsavedEdits(current, result.baseline)).toBe(false);
    expect(hasUnsavedEdits(current, baseline)).toBe(true); // without updating the baseline, Back would prompt
  });

  it("does not seed once the user has edited, or when the draft is an existing board", () => {
    const { draft, baseline } = freshDraft();
    const edited = { ...draft, content: { ...draft.content, title: "My title" } };
    expect(seedFreshClassicIfClean(edited, kit, baseline)).toBeNull();
    const existing = { ...draft, id: "menu-1" };
    expect(seedFreshClassicIfClean(existing, kit, { ...baseline, content: existing.content })).toBeNull();
    expect(seedFreshClassicIfClean(draft, null, baseline)).toBeNull();
  });

  it("is used inside ClassicEditor with a baseline update, not as a MenuBoards late setView that leaves the editor dirty", () => {
    const editor = readFileSync("components/classic-editor.tsx", "utf8");
    expect(editor).toContain("seedFreshClassicIfClean(draft, brand, baseline.current)");
    expect(editor).toContain("baseline.current = next.baseline");
    expect(editor).toContain("setDraft(next.draft)");
    const boards = readFileSync("components/menu-boards.tsx", "utf8");
    expect(boards).toContain("brand={kit}");
    expect(boards).toContain("seedClassicMenu(sampleMenu(), brand)");
    expect(boards).not.toContain("seedFreshClassicIfClean");
    expect(boards).not.toContain("setView({ ...view, draft: { ...view.draft, content: next } })");
  });
});

describe("byte-identical apply route and unchanged player.html", () => {
  it("does not modify POST /api/brand/apply", () => {
    const hash = createHash("sha256").update(readFileSync("app/api/brand/apply/route.ts")).digest("hex");
    expect(hash).toBe(APPLY_SHA);
  });

  it("does not modify public/player.html", () => {
    const hash = createHash("sha256").update(readFileSync("public/player.html")).digest("hex");
    expect(hash).toBe(PLAYER_SHA);
  });
});
