import { requireAdmin } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { withLocalizedErrors } from "@/lib/server/locale";
import { developerFromRequest } from "@/lib/server/dev-analytics/authz";
import { layoutStudioEnabled } from "@/lib/layout-studio";
import { menuTemplatesEnabledFor, menuTemplatesSetting, unifiedEditorEnabledFor, unifiedEditorSetting } from "@/lib/menu-templates-flag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether the signed-in account sees the premium template gallery and guided editor (lib/menu-templates-flag.ts). */
export const GET = withLocalizedErrors(async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const setting = menuTemplatesSetting();
  const unifiedSetting = unifiedEditorSetting();
  // Only ask the developer table when it can change the answer.
  const developer = (setting.mode === "list" || unifiedSetting.mode === "list") && layoutStudioEnabled() ? Boolean(await developerFromRequest(req).catch(() => null)) : false;
  const who = { email: admin.email, accountId: admin.accountId, developer };
  const enabled = menuTemplatesEnabledFor(who, setting, layoutStudioEnabled());
  // The unified menu designer (one editor for every board) is a separate, narrower switch.
  const unified = unifiedEditorEnabledFor(who, setting, unifiedSetting, layoutStudioEnabled());
  return json({ enabled, unified }, 200, { "Cache-Control": "no-store" });
});
