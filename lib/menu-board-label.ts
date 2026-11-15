import type { T } from "@/lib/i18n";
import { classifyBoardContent } from "@/lib/menu-board-unify";
import { MENU_TEMPLATES } from "@/lib/menu-templates";

/**
 * The kind label on a board in the menus list. A layout board uses the same name as the Studio template picker
 * (lt.<template>.name), so one layout never has two names (QA R13-03). Display only: stored ids are unchanged.
 */
export function boardKindLabel(template: unknown, content: unknown, t: T): string {
  const classified = classifyBoardContent(template, content);
  if (classified.kind === "layout") return t(`lt.${classified.document.template}.name`);
  if (classified.kind === "classic") {
    const tpl = MENU_TEMPLATES.find((item) => item.id === classified.template);
    return tpl ? t(`tpl.${tpl.id}.name`) : t("mb.kindMenu");
  }
  return t("mb.kindBoard");
}
