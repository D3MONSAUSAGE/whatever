/**
 * GUEST_EDITOR: lets visitors build a menu in the real editor before creating an account (docs/GUEST_EDITOR_PLAN.md).
 * Read on the server at request time. "on" turns it on; anything else (unset, "off") keeps today's behaviour: every
 * trial CTA goes to /signup and /create is a 404. One variable to roll back.
 */
export function guestEditorEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.GUEST_EDITOR ?? "").trim().toLowerCase() === "on";
}

/** Where every "Create my free menu" CTA points. */
export function createMenuHref(env: Record<string, string | undefined> = process.env): string {
  return guestEditorEnabled(env) ? "/create" : "/signup";
}
