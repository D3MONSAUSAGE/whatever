import { requireAdmin } from "@/lib/server/auth";
import { enforceLimit, fail, readJson } from "@/lib/server/http";
import { isMenuTemplate, parseMenuContent } from "@/lib/menu-templates";
import { renderMenuPng } from "@/lib/server/menu-render";
import { artFor } from "@/lib/server/brand";
import { checkMenuPhoto } from "@/lib/server/menus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Render a preview PNG without saving anything. */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  if (!isMenuTemplate(body.template)) return fail("Choose a template.", 400);
  const content = parseMenuContent(body.content);
  if (!content.ok) return fail(content.error, 400);
  const limited = await enforceLimit(`menu-preview:${admin.userId}`, 60, 60, "Too many previews. Wait a minute.");
  if (limited) return limited;
  const photo = await checkMenuPhoto(admin.accountId, content.value);
  if (photo) return fail(photo.error, photo.status);
  const png = renderMenuPng(body.template, content.value, await artFor(admin.accountId, content.value));
  return new Response(Buffer.from(png), { status: 200, headers: { "content-type": "image/png", "cache-control": "no-store" } });
}
