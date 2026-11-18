/**
 * Rollout switch for premium menu templates (gallery + guided editor). Server-side, set in the deployment
 * environment as MENU_TEMPLATES:
 *   unset       → developer accounts only (public.developer_users), so the team can test on real accounts;
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
  if (!raw) return { mode: "list", entries: [] };
  const lower = raw.toLowerCase();
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
