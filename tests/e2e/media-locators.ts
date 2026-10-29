import { expect, type Page } from "@playwright/test";

/** The file name on a library card, not the upload-progress row that shows the same name immediately. */
export function libraryFile(page: Page, name: string) {
  return page.locator("[data-media-library]").getByText(name, { exact: true });
}

/** Resolves only after the file is in the library, which is after the upload request finishes. */
export async function waitForLibraryFile(page: Page, name: string) {
  await expect(libraryFile(page, name)).toBeVisible({ timeout: 30_000 });
}
