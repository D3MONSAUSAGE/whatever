import type { Page } from "@playwright/test";

/** Redesign phase 1: Sign out lives in the account menu in the top bar (all screen sizes). */
export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
}

/** Phone: Playlists, Overview, Account and Notifications open from the "More" tab. */
export async function openFromMore(page: Page, name: string) {
  await page.getByTestId("nav-more").click();
  await page.getByRole("dialog").getByRole("link", { name, exact: true }).click();
}
