import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleMenu, type MenuContent } from "@/lib/menu-templates";
import { classicSaveContent } from "@/lib/menu-designer";

// PATCH /api/menus/[id] (classic boards; also the Android app): item photos the client doesn't send are kept,
// and every stored item photo must be one of this account's own images.
const ID = "11111111-1111-4111-8111-111111111111";
const OWN = "00000000-0000-4000-8000-000000000101";
const OWN2 = "00000000-0000-4000-8000-000000000102";
const FOREIGN = "00000000-0000-4000-8000-000000000999";
let stored: Record<string, unknown> = {};
const patches: { content?: MenuContent }[] = [];
const mediaRows = [{ id: OWN, mime_type: "image/jpeg" }, { id: OWN2, mime_type: "image/png" }];

vi.mock("@/lib/server/auth", () => ({ requireAdmin: async () => ({ accountId: "acct", userId: "user" }) }));
vi.mock("@/lib/server/supabase", () => ({
  BUCKET: "media",
  db: () => {
    let ids: string[] = [];
    const q = {
      select: () => q, eq: () => q,
      in: (_c: string, v: string[]) => { ids = v; return q; },
      maybeSingle: async () => ({ data: { id: ID, name: "Board", template: "fresh", content: stored, media_id: null, playlist_id: null }, error: null }),
      then: (ok: (r: unknown) => unknown) => ok({ data: mediaRows.filter((r) => ids.includes(r.id)), error: null }),
    };
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
const withPhoto = (c: MenuContent, si: number, ii: number, id: string): MenuContent => ({
  ...c, sections: c.sections.map((s, i) => (i === si ? { ...s, items: s.items.map((it, j) => (j === ii ? { ...it, imageMediaId: id } : it)) } : s)),
});
/** What the Android app sends: sampleMenu-shaped content with no item photo keys. */
const android = () => JSON.parse(JSON.stringify(sampleMenu())) as Record<string, unknown>;

describe("classic item photos through PATCH /api/menus/[id]", () => {
  beforeEach(() => { patches.length = 0; stored = { ...withPhoto(sampleMenu(), 0, 0, OWN), itemPhotos: false }; });

  it("an Android edit (no item photo keys) keeps the stored photo and the hide setting", async () => {
    const saved = await patch({ ...android(), title: "Edited on Android" });
    expect(saved.title).toBe("Edited on Android");
    expect(saved.sections[0].items[0].imageMediaId).toBe(OWN);
    expect(saved.itemPhotos).toBe(false);
  });

  it("the web designer's save is taken as sent: removal sticks, new photos are stored", async () => {
    const removed = await patch(classicSaveContent(sampleMenu()));
    expect(removed.sections[0].items[0].imageMediaId).toBeUndefined();
    expect("itemPhotos" in removed).toBe(false);
    const added = await patch(classicSaveContent(withPhoto(sampleMenu(), 1, 0, OWN2)));
    expect(added.sections[1].items[0].imageMediaId).toBe(OWN2);
    expect(added.sections[0].items[0].imageMediaId).toBeUndefined();
  });

  it("a photo that isn't this account's own image is dropped; the item keeps its text", async () => {
    const saved = await patch(classicSaveContent(withPhoto(sampleMenu(), 0, 1, FOREIGN)));
    expect(saved.sections[0].items[1].imageMediaId).toBeUndefined();
    expect(saved.sections[0].items[1].name).toBe(sampleMenu().sections[0].items[1].name);
  });

  it("layout and template boards still refuse content edits from older clients (409)", async () => {
    const { sampleLayout } = await import("@/lib/layout-studio");
    stored = sampleLayout("two-column") as unknown as Record<string, unknown>;
    const { PATCH } = await import("@/app/api/menus/[id]/route");
    const res = await PATCH(new Request(`http://x/api/menus/${ID}`, { method: "PATCH", body: JSON.stringify({ content: android() }) }), { params: Promise.resolve({ id: ID }) });
    expect(res.status).toBe(409);
  });
});
