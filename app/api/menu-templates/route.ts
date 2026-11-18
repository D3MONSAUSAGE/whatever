import { requireAdmin } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { withLocalizedErrors } from "@/lib/server/locale";
import { developerFromRequest } from "@/lib/server/dev-analytics/authz";
import { layoutStudioEnabled } from "@/lib/layout-studio";
import { menuTemplatesEnabledFor, menuTemplatesSetting } from "@/lib/menu-templates-flag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether the signed-in account sees the premium template gallery and guided editor (lib/menu-templates-flag.ts). */
export const GET = withLocalizedErrors(async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const setting = menuTemplatesSetting();
  // Only ask the developer table when it can change the answer.
  const developer = setting.mode === "list" && layoutStudioEnabled() ? Boolean(await developerFromRequest(req).catch(() => null)) : false;
  const enabled = menuTemplatesEnabledFor({ email: admin.email, accountId: admin.accountId, developer }, setting, layoutStudioEnabled());
  return json({ enabled }, 200, { "Cache-Control": "no-store" });
});
