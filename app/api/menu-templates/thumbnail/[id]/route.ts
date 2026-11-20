import { catalogVersion, unbrandedSeed } from "@/lib/menu-catalog";
import { designById, designDocument } from "@/lib/menu-designs";
import { withLocalizedErrors } from "@/lib/server/locale";

export const runtime = "nodejs";
// Thumbnails depend only on the URL; the CDN keeps them.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Rendered widths. Requests snap up to one of these so only a small, fixed set of images is ever drawn. */
const THUMBNAIL_WIDTHS = [320, 640, 960, 1280, 1920] as const;
const DEFAULT_WIDTH = 640;

function snapWidth(raw: string | null): number {
  const n = raw === null ? DEFAULT_WIDTH : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WIDTH;
  return THUMBNAIL_WIDTHS.find((w) => w >= n) ?? THUMBNAIL_WIDTHS[THUMBNAIL_WIDTHS.length - 1];
}

const notFound = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });

/**
 * Public 16:9 PNG of a catalog entry's sample board (template sample content and bundled stock photos only: no account
 * data, so no sign-in). Drawn by the same renderer as published boards. Any request that isn't the canonical URL
 * (current version, snapped width, known variant) redirects to it, so caches hold one image per entry, variant and width.
 */
export const GET = withLocalizedErrors(async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const seed = unbrandedSeed(id);
  if (!seed) return notFound();
  const url = new URL(req.url);
  const design = designById(id);
  const variantParam = url.searchParams.get("variant");
  if (variantParam !== null && (!design || !design.variants.some((v) => v.id === variantParam))) return notFound();
  const variant = design && variantParam && variantParam !== design.variants[0]?.id ? variantParam : null;
  const width = snapWidth(url.searchParams.get("w"));
  const version = catalogVersion();
  const canonical = new URLSearchParams({ v: version, w: String(width) });
  if (variant) canonical.set("variant", variant);
  if (url.search !== `?${canonical.toString()}`) {
    return new Response(null, { status: 308, headers: { location: `${url.pathname}?${canonical.toString()}`, "cache-control": "public, max-age=300" } });
  }
  let png: Uint8Array;
  if (seed.kind === "classic") {
    const { renderMenuPng } = await import("@/lib/server/menu-render");
    png = renderMenuPng("classic", seed.content, {}, width);
  } else {
    const { renderLayoutPng } = await import("@/lib/server/layout-render");
    const doc = design && variant ? designDocument(design, variant) : seed.document;
    png = renderLayoutPng(doc, null, { width });
  }
  return new Response(Buffer.from(png), {
    status: 200,
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, s-maxage=31536000, immutable" },
  });
});
