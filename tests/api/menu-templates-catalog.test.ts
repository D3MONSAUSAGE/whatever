import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as me } from "@/app/api/me/route";
import { GET as catalogGet } from "@/app/api/menu-templates/catalog/route";
import { GET as thumbnailGet } from "@/app/api/menu-templates/thumbnail/[id]/route";
import { POST as previewPost } from "@/app/api/layout-studio/preview/route";
import { POST as studioPost } from "@/app/api/layout-studio/route";
import { POST as switchPost } from "@/app/api/menu-templates/switch/route";
import { POST as menusPost } from "@/app/api/menus/route";
import { accountSaveBody } from "@/lib/layout-account";
import { MENU_DESIGNS, designDocument } from "@/lib/menu-designs";
import { galleryEntries, ORIGINAL_LAYOUTS } from "@/lib/menu-designer";
import { sampleLayout, type LayoutDocument } from "@/lib/layout-studio";
import { catalogVersion, type MenuCatalog } from "@/lib/menu-catalog";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb, type Store } from "./fake-db";

/**
 * Flutter menu-designer parity: the catalog is the web gallery's own source (no copy), the seeds create boards
 * through the existing routes, thumbnails are public and contain only sample content, and the preview draws only
 * this account's files. Contract: docs/FLUTTER_MANAGEMENT.md "Menu designer catalog".
 */
const previousFlag = process.env.LAYOUT_STUDIO;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
let store: Store;
let accountA = "";
let accountB = "";

function req(url: string, init: RequestInit & { token?: string | null } = {}) {
  const headers = new Headers(init.headers);
  if (init.token !== null) headers.set("Authorization", `Bearer ${init.token ?? "token-a"}`);
  if (init.body) headers.set("Content-Type", "application/json");
  return new Request(`http://localhost${url}`, { ...init, headers });
}
const thumb = (path: string) => {
  const url = new URL(`http://localhost${path}`);
  const id = url.pathname.split("/").pop()!;
  return thumbnailGet(new Request(url), { params: Promise.resolve({ id }) });
};
async function catalog(token = "token-a", lang?: string) {
  const res = await catalogGet(req("/api/menu-templates/catalog", { token, headers: lang ? { "Accept-Language": lang } : {} }));
  return { res, body: await res.json() as MenuCatalog & { layoutStudio: boolean } };
}

beforeEach(async () => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  process.env.LAYOUT_STUDIO = "1";
  fake.addUser("token-a", A, "cafe@example.com");
  fake.addUser("token-b", B, "other@example.com");
  expect((await me(req("/api/me"))).status).toBe(200);
  expect((await me(req("/api/me", { token: "token-b" }))).status).toBe(200);
  accountA = String(store.accounts.find((row) => row.owner_user_id === A)!.id);
  accountB = String(store.accounts.find((row) => row.owner_user_id === B)!.id);
});
afterEach(() => {
  setTestDb(null);
  if (previousFlag === undefined) delete process.env.LAYOUT_STUDIO;
  else process.env.LAYOUT_STUDIO = previousFlag;
});

describe("GET /api/menu-templates/catalog", () => {
  it("requires sign-in", async () => {
    const res = await catalogGet(req("/api/menu-templates/catalog", { token: null }));
    expect(res.status).toBe(401);
  });

  it("lists the web gallery's entries in its order: every template, the classic board and 7 layouts", async () => {
    const { res, body } = await catalog();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("private");
    expect(body.schema).toBe(1);
    expect(body.version).toBe(catalogVersion());
    expect(body.entries.map((e) => e.id)).toEqual(galleryEntries().map((e) => e.id));
    expect(body.entries.filter((e) => e.kind === "template")).toHaveLength(MENU_DESIGNS.length);
    expect(body.entries.filter((e) => e.kind === "template").map((e) => e.id)).toEqual(MENU_DESIGNS.map((d) => d.id));
    expect(body.entries.filter((e) => e.kind === "layout").map((e) => e.id)).toEqual(ORIGINAL_LAYOUTS.map((l) => l.id));
    expect(body.entries.filter((e) => e.kind === "classic").map((e) => e.id)).toEqual(["full-screen"]);
    expect(new Set(body.entries.map((e) => e.id)).size).toBe(body.entries.length);
    expect(body.layoutStudio).toBe(true);
  });

  it("uses the same filters, names and seeds as the web, in English and Spanish", async () => {
    const { body } = await catalog();
    expect(body.filters.business.map((f) => f.id)).toEqual(["all", "restaurant", "cafe", "fast", "bar", "sweets", "salon", "retail", "fitness", "office", "pets"]);
    expect(body.filters.style.map((f) => f.id)).toEqual(["all", "dark", "light", "bold"]);
    expect(body.filters.structure.map((f) => f.id)).toEqual(["all", "single", "columns", "media", "cards"]);
    // Older clients' font list is unchanged; the template-only faces are listed separately (additive).
    expect(body.fonts).toEqual(["inter", "noto-serif", "oswald", "montserrat", "bebas-neue", "lobster"]);
    expect(body.templateFonts).toEqual([...body.fonts, "cormorant-garamond", "playfair-display"]);
    expect(body.filters.business.find((f) => f.id === "sweets")!.name).toEqual({ en: "Drinks & sweets", es: expect.any(String) });
    const gallery = galleryEntries();
    for (const entry of body.entries) {
      const source = gallery.find((g) => g.id === entry.id)!;
      expect([entry.business, entry.style, entry.structure, entry.photos]).toEqual([source.business, source.style, source.structure, source.photos]);
      expect(entry.name.en.length).toBeGreaterThan(0);
      expect(entry.name.es.length).toBeGreaterThan(0);
      expect(entry.description.es.length).toBeGreaterThan(0);
      expect(entry.thumbnailPath).toBe(`/api/menu-templates/thumbnail/${entry.id}?v=${body.version}&w=640`);
    }
    for (const design of MENU_DESIGNS) {
      const entry = body.entries.find((e) => e.id === design.id)!;
      expect(entry.name).toEqual(design.name);
      expect(entry.variants.map((v) => v.id)).toEqual(design.variants.map((v) => v.id));
      expect(entry.create).toEqual({ route: "POST /api/layout-studio", document: JSON.parse(JSON.stringify(designDocument(design))) });
    }
    // Layout seeds are the web's newLayoutDocument: the sample board plus the account's (here default) kit colours.
    const split = body.entries.find((e) => e.id === "split-50")!.create as { route: string; document: LayoutDocument };
    expect(split.route).toBe("POST /api/layout-studio");
    expect(split.document.sections).toEqual(sampleLayout("split-50").sections);
    expect(split.document.template).toBe("split-50");
    // Names are bilingual in one response; the Accept-Language header doesn't change the contract.
    const es = await catalog("token-a", "es");
    expect(es.body.entries).toEqual(body.entries);
  });

  it("brands seeds with this account's kit only, like the web (templates take only the business name)", async () => {
    store.brand_kits.push({ account_id: accountA, primary_color: "#123456", accent_color: "#abcdef", logo_media_id: null, display_name: "Casa Verde", phone: "555-0100" });
    const a = (await catalog()).body;
    const b = (await catalog("token-b")).body;
    const layoutA = a.entries.find((e) => e.id === "two-column")!.create as { document: LayoutDocument };
    expect(layoutA.document.primaryColor).toBe("#123456");
    expect(layoutA.document.title).toBe("Casa Verde");
    const classicA = a.entries.find((e) => e.id === "full-screen")!.create as { content: { title: string } };
    expect(classicA.content.title).toBe("Casa Verde");
    expect(JSON.stringify(b)).not.toContain("Casa Verde");
    expect(JSON.stringify(b)).not.toContain("#123456");
    // Nothing account-specific beyond the seeds: no ids, emails or media.
    const text = JSON.stringify(a);
    for (const secret of [accountA, accountB, A, "cafe@example.com", "logoMediaId\":\""]) expect(text).not.toContain(secret);
    const templateA = (a.entries.find((e) => e.id === "modern-restaurant")!.create as { document: LayoutDocument }).document;
    const templateB = (b.entries.find((e) => e.id === "modern-restaurant")!.create as { document: LayoutDocument }).document;
    expect(templateA).toEqual({ ...templateB, title: "Casa Verde" });
    expect(templateB.primaryColor).toBeNull();
    expect(a.entries[0].boardName).toBe("Casa Verde");
    expect(b.entries[0].boardName).toBeNull();
  });

  it("seeds create boards through the existing routes", async () => {
    const { body } = await catalog();
    for (const id of ["modern-restaurant", "photo-menu-grid", "two-column", "signature"]) {
      const create = body.entries.find((e) => e.id === id)!.create as { document: LayoutDocument };
      const res = await studioPost(req("/api/layout-studio", { method: "POST", body: JSON.stringify(accountSaveBody({ mode: "draft", menuId: null, name: id, document: create.document })) }));
      expect(res.status, id).toBe(200);
    }
    const classic = body.entries.find((e) => e.id === "full-screen")!.create as { template: string; content: unknown };
    const res = await menusPost(req("/api/menus", { method: "POST", body: JSON.stringify({ name: "Lunch", template: classic.template, content: classic.content }) }));
    expect(res.status).toBeLessThan(300);
    const scratch = await studioPost(req("/api/layout-studio", { method: "POST", body: JSON.stringify(accountSaveBody({ mode: "draft", menuId: null, name: "Blank", document: body.scratch.create.document })) }));
    expect(scratch.status).toBe(200);
  });
});

describe("GET /api/menu-templates/thumbnail/[id]", () => {
  it("serves a public PNG of the sample board without sign-in, cacheable", async () => {
    const path = `/api/menu-templates/thumbnail/modern-restaurant?v=${catalogVersion()}&w=640`;
    const res = await thumb(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("public");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
    expect(new DataView(bytes.buffer).getUint32(16)).toBe(640);
    expect(new DataView(bytes.buffer).getUint32(20)).toBe(360);
  }, 30000);

  it("draws every entry and variant the catalog lists", async () => {
    const v = catalogVersion();
    for (const entry of galleryEntries()) {
      const res = await thumb(`/api/menu-templates/thumbnail/${entry.id}?v=${v}&w=320`);
      expect(res.status, entry.id).toBe(200);
    }
    const design = MENU_DESIGNS.find((d) => d.variants.length > 1)!;
    const res = await thumb(`/api/menu-templates/thumbnail/${design.id}?v=${v}&w=320&variant=${design.variants[1].id}`);
    expect(res.status).toBe(200);
  }, 120000);

  it("draws the vertical (9:16) sample with orientation=portrait; landscape URLs are unchanged", async () => {
    const v = catalogVersion();
    const tall = await thumb(`/api/menu-templates/thumbnail/modern-restaurant?v=${v}&w=640&orientation=portrait`);
    expect(tall.status).toBe(200);
    const bytes = new Uint8Array(await tall.arrayBuffer());
    expect(new DataView(bytes.buffer).getUint32(16)).toBe(640);
    expect(new DataView(bytes.buffer).getUint32(20)).toBe(1138);
    const classic = await thumb(`/api/menu-templates/thumbnail/full-screen?v=${v}&w=320&orientation=portrait`);
    expect(classic.status).toBe(200);
    expect(new DataView((await classic.arrayBuffer())).getUint32(20)).toBe(569);
    // Widths snap to the 1080-wide canvas at most; the parameter is part of the canonical URL.
    const big = await thumb(`/api/menu-templates/thumbnail/two-column?orientation=portrait&w=1920`);
    expect(big.status).toBe(308);
    expect(big.headers.get("location")).toBe(`/api/menu-templates/thumbnail/two-column?v=${v}&w=1080&orientation=portrait`);
    expect((await thumb(`/api/menu-templates/thumbnail/two-column?v=${v}&w=640&orientation=sideways`)).status).toBe(404);
    // orientation=landscape is a no-op: it lands on the normal landscape thumbnail.
    const wide = await thumb(`/api/menu-templates/thumbnail/two-column?v=${v}&w=640&orientation=landscape`);
    expect(wide.status).toBe(308);
    expect(wide.headers.get("location")).toBe(`/api/menu-templates/thumbnail/two-column?v=${v}&w=640`);
    const followed = await thumb(wide.headers.get("location")!);
    expect(followed.status).toBe(200);
    const wideBytes = new Uint8Array(await followed.arrayBuffer());
    expect(new DataView(wideBytes.buffer).getUint32(20)).toBe(360);
    // The catalog's own thumbnail paths stay landscape.
    const { body } = await catalog();
    expect(body.entries.every((e) => !e.thumbnailPath.includes("orientation"))).toBe(true);
  }, 60000);

  it("redirects non-canonical URLs and refuses unknown ids and variants", async () => {
    const v = catalogVersion();
    const stale = await thumb("/api/menu-templates/thumbnail/trattoria?v=old&w=500");
    expect(stale.status).toBe(308);
    expect(stale.headers.get("location")).toBe(`/api/menu-templates/thumbnail/trattoria?v=${v}&w=640`);
    const bare = await thumb("/api/menu-templates/thumbnail/two-column");
    expect(bare.headers.get("location")).toBe(`/api/menu-templates/thumbnail/two-column?v=${v}&w=640`);
    expect((await thumb(`/api/menu-templates/thumbnail/nope?v=${v}&w=640`)).status).toBe(404);
    expect((await thumb(`/api/menu-templates/thumbnail/trattoria?v=${v}&w=640&variant=nope`)).status).toBe(404);
    expect((await thumb(`/api/menu-templates/thumbnail/two-column?v=${v}&w=640&variant=x`)).status).toBe(404);
  });
});

describe("POST /api/layout-studio/preview", () => {
  const preview = (document: unknown, extra: Record<string, unknown> = {}, token = "token-a") =>
    previewPost(req("/api/layout-studio/preview", { method: "POST", token, body: JSON.stringify({ document, ...extra }) }));

  it("is off with LAYOUT_STUDIO and requires sign-in", async () => {
    expect((await preview(sampleLayout("two-column"), {}, "nobody")).status).toBe(401);
    process.env.LAYOUT_STUDIO = "0";
    expect((await preview(sampleLayout("two-column"))).status).toBe(404);
  });

  it("returns the board PNG with fit headers, saving nothing", async () => {
    const menus = store.menus.length;
    const media = store.media.length;
    const res = await preview(designDocument(MENU_DESIGNS[0]), { width: 480 });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-board-can-publish")).toBe("true");
    expect(res.headers.get("x-board-dropped-items")).toBe("0");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new DataView(bytes.buffer).getUint32(16)).toBe(480);
    expect(store.menus.length).toBe(menus);
    expect(store.media.length).toBe(media);
  }, 30000);

  it("width is the PNG width for vertical boards; 1080 and up draws the native 1080×1920", async () => {
    const tall = { ...designDocument(MENU_DESIGNS[0]), orientation: "portrait" };
    const size = async (width: number) => {
      const res = await preview(tall, { width });
      expect(res.status).toBe(200);
      const view = new DataView(new Uint8Array(await res.arrayBuffer()).buffer);
      return [view.getUint32(16), view.getUint32(20)];
    };
    expect(await size(960)).toEqual([960, 1707]);
    expect(await size(1920)).toEqual([1080, 1920]);
    const wide = await preview(designDocument(MENU_DESIGNS[0]), { width: 1920 });
    expect(new DataView(new Uint8Array(await wide.arrayBuffer()).buffer).getUint32(20)).toBe(1080);
  }, 60000);

  it("reports the same fit publish enforces", async () => {
    const doc = designDocument(MENU_DESIGNS.find((d) => d.id === "modern-restaurant")!);
    const crowded = { ...doc, sections: [0, 1].map((n) => ({ name: `Section ${n}`, items: Array.from({ length: 12 }, (_, i) => ({ name: `Dish number ${i} with a long name`, price: "$9", description: "Slow cooked with herbs, garlic and lemon" })) })) };
    const fit = await preview(crowded, { format: "fit" });
    expect(fit.status).toBe(200);
    const body = await fit.json() as { fit: { canPublish: boolean; droppedItems: number } };
    expect(body.fit.canPublish).toBe(false);
    expect(body.fit.droppedItems).toBeGreaterThan(0);
    const publish = await studioPost(req("/api/layout-studio", { method: "POST", body: JSON.stringify(accountSaveBody({ mode: "publish", menuId: null, name: "Too long", document: crowded })) }));
    expect(publish.status).toBe(400);
    const layout = await preview({ ...sampleLayout("two-column"), sections: [...sampleLayout("two-column").sections, { name: "Extra", items: [{ name: "Soup", price: "$4", description: "" }] }] }, { format: "fit" });
    const layoutFit = (await layout.json() as { fit: { canPublish: boolean; hiddenSections: number; hiddenItems: number } }).fit;
    expect(layoutFit).toMatchObject({ canPublish: true, hiddenSections: 1, hiddenItems: 1 });
  });

  it("refuses invalid documents with a localized message", async () => {
    const res = await previewPost(req("/api/layout-studio/preview", { method: "POST", headers: { "Accept-Language": "es" }, body: JSON.stringify({ document: { layoutVersion: 9 } }) }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).not.toBe("This layout version is not supported.");
  });

  it("never draws another account's image", async () => {
    const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
    const foreign = "60000000-0000-4000-8000-0000000000b1";
    store.media.push({ id: foreign, account_id: accountB, file_name: "secret.png", storage_path: `${accountB}/secret.png`, mime_type: "image/png", size_bytes: png.length, kind: "image" });
    store.objects.set(`${accountB}/secret.png`, png);
    const doc = { ...sampleLayout("split-50"), imageMediaId: foreign };
    const withForeign = new Uint8Array(await (await preview(doc)).arrayBuffer());
    const without = new Uint8Array(await (await preview({ ...doc, imageMediaId: null })).arrayBuffer());
    expect(Buffer.from(withForeign).equals(Buffer.from(without))).toBe(true);
  }, 30000);
});

describe("POST /api/menu-templates/switch", () => {
  const sw = (body: Record<string, unknown>, lang?: string) =>
    switchPost(req("/api/menu-templates/switch", { method: "POST", headers: lang ? { "Accept-Language": lang } : {}, body: JSON.stringify(body) }));
  const mine = () => ({ ...designDocument(MENU_DESIGNS[0]), title: "Casa Verde", sections: [{ name: "Tacos", items: [{ name: "Al pastor", price: "$4", description: "" }] }] });

  it("keeps the owner's content when changing template, variant or layout", async () => {
    const target = MENU_DESIGNS.find((d) => d.variants.length > 1 && d.id !== MENU_DESIGNS[0].id)!;
    const res = await sw({ document: mine(), to: target.id, variant: target.variants[1].id });
    expect(res.status).toBe(200);
    const body = await res.json() as { document: LayoutDocument; fit: { canPublish: boolean; suggestions: unknown } };
    expect(body.document).toMatchObject({ design: target.id, variant: target.variants[1].id, title: "Casa Verde" });
    expect(body.document.sections[0].items[0].name).toBe("Al pastor");
    expect(body.fit.canPublish).toBe(true);
    const toLayout = await (await sw({ document: mine(), to: "triple-column" })).json() as { document: LayoutDocument };
    expect(toLayout.document.design).toBeUndefined();
    expect(toLayout.document.template).toBe("triple-column");
    expect(toLayout.document.sections[0].items[0].name).toBe("Al pastor");
  });

  it("refuses unknown ids and variants, in Spanish too", async () => {
    expect((await sw({ document: mine(), to: "nope" })).status).toBe(400);
    expect((await sw({ document: mine(), to: "two-column", variant: "x" })).status).toBe(400);
    const es = await (await sw({ document: mine(), to: "nope" }, "es")).json() as { error: string };
    expect(es.error).toBe("Elija una plantilla o un diseño del catálogo.");
  });

  it("suggests the editor's roomier template when items don't fit", async () => {
    const crowded = { ...mine(), sections: [0, 1].map((n) => ({ name: `S${n}`, items: Array.from({ length: 12 }, (_, i) => ({ name: `Dish number ${i} with a long name`, price: "$9", description: "Slow cooked with herbs, garlic and lemon" })) })) };
    const body = await (await sw({ document: crowded, to: "modern-restaurant" })).json() as { fit: { canPublish: boolean; suggestions: { roomierTemplate: string | null } } };
    expect(body.fit.canPublish).toBe(false);
    expect(["diner-classics", "taqueria-specials"]).toContain(body.fit.suggestions.roomierTemplate);
  });
});
