import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleMenu, type MenuContent } from "@/lib/menu-templates";

// Gother #107 MEDIUM: Android +13 PATCHes /api/menus without headingFont/bodyFont. Absent keys keep the
// stored fonts; an explicit null or "" clears them; create without fonts stays Inter (no font keys).
const ID = "11111111-1111-4111-8111-111111111111";
let stored: Record<string, unknown> = {};
const patches: { content?: MenuContent }[] = [];

vi.mock("@/lib/server/auth", () => ({ requireAdmin: async () => ({ accountId: "acct", userId: "user" }) }));
vi.mock("@/lib/server/supabase", () => ({
  BUCKET: "media",
  db: () => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: ID, name: "Board", template: "fresh", content: stored, media_id: null, playlist_id: null }, error: null }) };
    return { from: () => q, rpc: async () => ({ data: true, error: null }) };
  },
}));
vi.mock("@/lib/server/http", async (orig) => ({ ...(await orig<typeof import("@/lib/server/http")>()), enforceLimit: async () => null }));
vi.mock("@/lib/server/menus", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/menus")>()),
  checkMenuPhoto: async () => null,
  rerenderMenu: async (_a: string, _r: unknown, patch: { content?: MenuContent }) => { patches.push(patch); return { ok: true, mediaId: "m", playlistId: "p" }; },
}));

async function patch(content: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/menus/[id]/route");
  const res = await PATCH(new Request(`http://x/api/menus/${ID}`, { method: "PATCH", body: JSON.stringify({ content }) }), { params: Promise.resolve({ id: ID }) });
  expect(res.status).toBe(200);
  return patches.at(-1)!.content!;
}

/** What Android +13's MenuContent.toJson sends: no font keys at all. */
const androidContent = () => { const c = { ...sampleMenu() } as Record<string, unknown>; delete c.headingFont; delete c.bodyFont; return c; };

describe("E6: PATCH /api/menus/[id] keeps fonts a client didn't send", () => {
  beforeEach(() => { patches.length = 0; stored = { ...sampleMenu(), headingFont: "bebas-neue", bodyFont: "montserrat" }; });

  it("absent keys keep the stored fonts (an Android +13 edit doesn't strip them)", async () => {
    const saved = await patch({ ...androidContent(), title: "Edited on Android" });
    expect(saved).toMatchObject({ title: "Edited on Android", headingFont: "bebas-neue", bodyFont: "montserrat" });
  });

  it("an explicit null or empty string clears just that font", async () => {
    const a = await patch({ ...androidContent(), headingFont: null });
    expect(a.headingFont).toBeUndefined();
    expect(a.bodyFont).toBe("montserrat");
    const b = await patch({ ...androidContent(), bodyFont: "" });
    expect(b.bodyFont).toBeUndefined();
    expect(b.headingFont).toBe("bebas-neue");
  });

  it("a sent font replaces the stored one; an invalid font is refused", async () => {
    expect(await patch({ ...androidContent(), headingFont: "lobster" })).toMatchObject({ headingFont: "lobster", bodyFont: "montserrat" });
    const { PATCH } = await import("@/app/api/menus/[id]/route");
    const bad = await PATCH(new Request(`http://x/api/menus/${ID}`, { method: "PATCH", body: JSON.stringify({ content: { ...androidContent(), bodyFont: "comic-sans" } }) }), { params: Promise.resolve({ id: ID }) });
    expect(bad.status).toBe(400);
  });

  it("a board stored without fonts stays without fonts", async () => {
    stored = { ...sampleMenu() };
    const saved = await patch(androidContent());
    expect("headingFont" in saved || "bodyFont" in saved).toBe(false);
  });

  it("create without fonts stays Inter: no font keys are stored", async () => {
    const { parseMenuBody } = await import("@/lib/server/menus");
    const created = parseMenuBody({ name: "New", template: "fresh", content: androidContent() });
    expect(created.ok && ("headingFont" in created.value.content! || "bodyFont" in created.value.content!)).toBe(false);
  });
});
