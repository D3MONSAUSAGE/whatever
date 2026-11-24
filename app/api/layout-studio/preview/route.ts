import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { rejectSubscriptionWrite } from "@/lib/server/subscription-write";
import { withLocalizedErrors } from "@/lib/server/locale";
import { layoutStudioEnabled, parseLayout } from "@/lib/layout-studio";
import { boardFit } from "@/lib/board-fit";
import { boardCanvas, orientationOf } from "@/lib/board-orientation";
import { featuredPhotoSize, loadBoardArt } from "@/lib/server/layout-boards";
import { customizationSpec } from "@/lib/board-custom";
import { noteOnboarding } from "@/lib/server/onboarding-hooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WIDTHS = [480, 960, 1920] as const;

/**
 * Editor preview for API clients that can't run the SVG renderer (Flutter): the exact PNG publish would draw, plus
 * the fit report, without saving anything. Body: { document, width?: 480|960|1920, format?: "png"|"fit" }.
 * Only this account's own images are drawn. Refuses before any database call unless LAYOUT_STUDIO is "1".
 */
export const POST = withLocalizedErrors(async function POST(req: Request) {
  if (!layoutStudioEnabled()) return fail("Not found", 404);
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const writeBlocked = await rejectSubscriptionWrite(admin.accountId, req);
  if (writeBlocked) return writeBlocked;
  const body = await readJson(req);
  const parsed = parseLayout(body.document);
  if (!parsed.ok) return fail(parsed.error, 400);
  const doc = parsed.value;
  if (body.format === "fit") {
    const limited = await enforceLimit(`board-fit:${admin.userId}`, 60, 240, "Too many previews. Wait a minute.");
    if (limited) return limited;
    // t421u: the featured photo's size lets PNG-preview clients map a drag exactly (only for boards with a photo area).
    const natural = customizationSpec(doc).imageFocus && !doc.videoMediaId && (doc.imageMediaId || doc.stockPhoto)
      ? await featuredPhotoSize(admin.accountId, doc).catch(() => null) : null;
    return json({ fit: boardFit(doc, { natural }) }, 200, { "Cache-Control": "no-store" });
  }
  const limited = await enforceLimit(`menu-preview:${admin.userId}`, 60, 60, "Too many previews. Wait a minute.");
  if (limited) return limited;
  // Onboarding v2: the app asked for the board's TV preview image (format "fit" alone doesn't count).
  noteOnboarding(req, admin.accountId, ["preview_menu"]);
  const fit = boardFit(doc);
  const requested = Number(body.width);
  const width = WIDTHS.find((w) => w >= requested) ?? 960;
  const { renderLayoutPng } = await import("@/lib/server/layout-render");
  const { photo, logo, itemImages } = await loadBoardArt(admin.accountId, doc);
  // `width` is the PNG width; the height follows the board's shape. At or above the canvas width (1920 landscape,
  // 1080 vertical) the board is drawn at its native size, never upscaled.
  const nativeWidth = boardCanvas(orientationOf(doc)).width;
  const png = renderLayoutPng(doc, photo, { logo, itemImages, width: width >= nativeWidth ? undefined : width });
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store",
      "x-board-can-publish": String(fit.canPublish),
      "x-board-dropped-items": String(fit.droppedItems),
      "x-board-hidden-sections": String(fit.hiddenSections),
      "x-board-hidden-items": String(fit.hiddenItems),
      "x-board-clipped-names": String(fit.clippedNames.length),
    },
  });
});
