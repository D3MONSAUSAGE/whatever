import { expect, type Page } from "@playwright/test";

/** One status region can be replaced. Match the message, not every status on the page. */
export function expectStatus(page: Page, text: string, timeout?: number) {
  return expect(page.getByRole("status").filter({ hasText: text })).toBeVisible(timeout ? { timeout } : undefined);
}
