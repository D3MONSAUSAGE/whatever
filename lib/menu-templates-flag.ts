/**
 * Rollout switch for premium menu templates (gallery + guided editor). Server-side, set in the deployment
 * environment as MENU_TEMPLATES:
 *   unset       → every customer (the feature is released; the flag stays as a rollout safeguard);
 *   "developers" → developer accounts only (public.developer_users), for testing or a soft rollback;
 *   "off"       → nobody (kill switch, also for developers);
 *   "all"       → every customer;
 *   a list     → developers plus these accounts, comma-separated emails or account ids
 *                 (e.g. "owner@example.com, 3f0c…-uuid").
 * Boards already made from a template keep rendering either way: the switch only controls the new gallery and
 * guided editor. The Layout Studio flag (LAYOUT_STUDIO=1) must also be on, because templates save through it.
 */
export type MenuTemplatesSetting = { mode: "off" | "all" | "list"; entries: string[] };

export function menuTemplatesSetting(env: Record<string, string | undefined> = process.env): MenuTemplatesSetting {
  const raw = (env.MENU_TEMPLATES ?? "").trim();
  if (!raw) return { mode: "all", entries: [] };
  const lower = raw.toLowerCase();
  if (lower === "developers" || lower === "dev" || lower === "developer") return { mode: "list", entries: [] };
  if (lower === "off" || lower === "0" || lower === "false") return { mode: "off", entries: [] };
  if (lower === "all" || lower === "on" || lower === "1") return { mode: "all", entries: [] };
  return { mode: "list", entries: lower.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean) };
}

export function menuTemplatesEnabledFor(
  who: { email: string; accountId: string; developer: boolean },
  setting: MenuTemplatesSetting,
  layoutStudioOn: boolean,
): boolean {
  if (!layoutStudioOn || setting.mode === "off") return false;
  if (setting.mode === "all" || who.developer) return true;
  const email = who.email.trim().toLowerCase();
  const account = who.accountId.trim().toLowerCase();
  return setting.entries.some((entry) => entry === email || entry === account);
}

/**
 * Rollout switch for the unified menu designer (one editor for templates, original layouts and classic boards,
 * item photos everywhere). Set as UNIFIED_MENU_EDITOR with the same values as MENU_TEMPLATES:
 *   unset → everyone (released); "developers" → developer accounts only; "off" → nobody; "all" → everyone;
 *   a list → developers plus these accounts.
 * It needs the template gallery to be on for the account as well. When it is off, the previous editors are used.
 */
export function unifiedEditorSetting(env: Record<string, string | undefined> = process.env): MenuTemplatesSetting {
  return menuTemplatesSetting({ MENU_TEMPLATES: env.UNIFIED_MENU_EDITOR });
}

export function unifiedEditorEnabledFor(
  who: { email: string; accountId: string; developer: boolean },
  templates: MenuTemplatesSetting,
  unified: MenuTemplatesSetting,
  layoutStudioOn: boolean,
): boolean {
  return menuTemplatesEnabledFor(who, templates, layoutStudioOn) && menuTemplatesEnabledFor(who, unified, layoutStudioOn);
}
