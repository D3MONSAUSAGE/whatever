import { after } from "next/server";
import { isRenderedFileName, menuHasUsableContent, type V2StepId } from "@/lib/onboarding";
import { isAndroidAppRequest } from "./android-status-copy";
import { markMilestones, type OnboardingSource } from "./onboarding";

/** Which client made the request, for the onboarding.* event detail only. */
export function onboardingSource(req: Request): OnboardingSource {
  try { return isAndroidAppRequest(req) ? "android" : "web"; } catch { return "web"; }
}

/**
 * Stamp onboarding milestones after a save has already succeeded. Runs after the response (next/server after),
 * never throws, never changes the response, and is idempotent, so a retry or a second save changes nothing.
 */
export function noteOnboarding(req: Request, accountId: string, steps: V2StepId[], kind: "menu_board" | "upload" | null = null) {
  try {
    const source = onboardingSource(req);
    const task = async () => {
      try { await markMilestones(accountId, steps, source, kind); } catch { /* analytics never blocks a save */ }
    };
    try { after(task); } catch { void task(); }
  } catch {
    /* never affect the save */
  }
}

/** A saved board (draft or published) with at least one named item or featured media. */
export function noteMenuSaved(req: Request, accountId: string, content: unknown) {
  try {
    if (menuHasUsableContent(content)) noteOnboarding(req, accountId, ["first_menu"], "menu_board");
  } catch {
    /* never affect the save */
  }
}

/** A finished upload of the owner's own image, video or deck (not a board still). */
export function noteUploadSaved(req: Request, accountId: string, fileName?: unknown) {
  if (isRenderedFileName(fileName)) return;
  noteOnboarding(req, accountId, ["first_menu"], "upload");
}
