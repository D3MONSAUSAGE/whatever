import { expect, test, type Page } from "@playwright/test";

const EDITOR = "/preview?screen=unified-edit&design=modern-restaurant";

async function clickId(page: Page, id: string) {
  await page.getByTestId(id).evaluate((el: HTMLElement) => el.click());
}

async function openLook(page: Page, locale: "en" | "es" = "en") {
  if (locale === "es") {
    await page.context().addCookies([{ name: "pekko_locale", value: "es", url: page.context().browser() ? new URL(page.url() || "http://localhost:3050").origin : "http://localhost:3050" }]);
  }
  await page.goto(EDITOR, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByTestId("tpl-step-3").waitFor({ state: "attached" });
  await clickId(page, "tpl-step-3");
  await page.getByTestId("tpl-orientation").waitFor();
  await page.mouse.move(0, 0);
}

async function metrics(page: Page) {
  return page.evaluate(() => {
    const preview = document.querySelector(".tpl-preview") as HTMLElement | null;
    const board = document.querySelector(".tpl-preview .tpl-board") as HTMLElement | null;
    const form = document.querySelector(".tpl-form") as HTMLElement | null;
    const look = document.getElementById("tpl-orient-label");
    const steps = document.querySelector(".tpl-steps") as HTMLElement | null;
    const save = document.querySelector("[data-testid=tpl-save-draft]") as HTMLElement | null;
    const publish = document.querySelector("[data-testid=tpl-publish]") as HTMLElement | null;
    const expand = document.querySelector("[data-testid=tpl-expand-preview]") as HTMLElement | null;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const overlaps = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
      !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const pb = box(preview), bb = box(board), lb = box(look), sb = box(steps), fb = box(form);
    return {
      vw, vh,
      previewPosition: preview ? getComputedStyle(preview).position : null,
      boardRatio: bb && bb.height ? bb.width / bb.height : null,
      board: bb,
      preview: pb,
      look: lb,
      steps: sb,
      form: fb,
      save: box(save),
      publish: box(publish),
      expandVisible: !!(expand && getComputedStyle(expand).display !== "none" && expand.getClientRects().length),
      lookCovered: overlaps(lb, pb) && (preview ? getComputedStyle(preview).position === "sticky" : false),
      stepsCovered: overlaps(sb, pb) && (preview ? getComputedStyle(preview).position === "sticky" : false),
      bodyOverflow: getComputedStyle(document.body).overflow,
      orientation: board?.getAttribute("data-orientation") || null,
    };
  });
}

async function revealLook(page: Page) {
  await page.getByTestId("tpl-orientation").evaluate((el) => el.scrollIntoView({ block: "center" }));
}

function isMobileProject(name: string) {
  return !name.startsWith("desktop");
}

test.describe("Step 4 mobile vertical preview", () => {
  test("horizontal stays compact and vertical stays capped with reachable controls", async ({ page }, info) => {
    const mobile = isMobileProject(info.project.name);
    await openLook(page, "en");

    const horiz = await metrics(page);
    expect(horiz.orientation).toBe("landscape");
    expect(horiz.boardRatio).toBeGreaterThan(1.7);
    expect(horiz.boardRatio).toBeLessThan(1.8);
    expect(horiz.expandVisible).toBe(false);
    if (mobile) {
      expect(horiz.previewPosition).toBe("sticky");
      expect(horiz.lookCovered).toBe(false);
      expect(horiz.stepsCovered).toBe(false);
    }

    await clickId(page, "tpl-orientation-portrait");
    await page.mouse.move(0, 0);
    await expect(page.getByTestId("tpl-canvas-size")).toHaveText("1080 × 1920");
    if (mobile) await revealLook(page);
    const vert = await metrics(page);
    expect(vert.orientation).toBe("portrait");
    expect(vert.boardRatio).toBeGreaterThan(0.54);
    expect(vert.boardRatio).toBeLessThan(0.58);
    if (mobile) {
      expect(vert.previewPosition).toBe("static");
      expect(vert.board!.height).toBeLessThanOrEqual(Math.ceil(vert.vh * 0.55) + 2);
      expect(vert.lookCovered).toBe(false);
      expect(vert.stepsCovered).toBe(false);
      expect(vert.expandVisible).toBe(true);
      // Save draft and Publish stay in the toolbar and can be brought into view.
      await page.getByTestId("tpl-save-draft").evaluate((el: HTMLElement) => el.scrollIntoView({ block: "center" }));
      await expect(page.getByTestId("tpl-save-draft")).toBeVisible();
      await page.getByTestId("tpl-publish").evaluate((el: HTMLElement) => el.scrollIntoView({ block: "center" }));
      await expect(page.getByTestId("tpl-publish")).toBeVisible();
    } else {
      expect(vert.expandVisible).toBe(false);
      expect(vert.previewPosition).toBe("sticky");
      // Two-column desktop: the form stays in view beside the preview.
      expect(vert.look!.top).toBeGreaterThan(0);
      expect(vert.look!.top).toBeLessThan(vert.vh);
    }

    // Repeated toggling must not lock scroll or hide controls.
    for (let i = 0; i < 3; i++) {
      await clickId(page, "tpl-orientation-landscape");
      await clickId(page, "tpl-orientation-portrait");
    }
    await page.mouse.move(0, 0);
    if (mobile) await revealLook(page);
    const again = await metrics(page);
    expect(again.orientation).toBe("portrait");
    expect(again.bodyOverflow).not.toBe("hidden");
    if (mobile) {
      expect(again.previewPosition).toBe("static");
      expect(again.lookCovered).toBe(false);
      expect(again.board!.height).toBeLessThanOrEqual(Math.ceil(again.vh * 0.55) + 2);
    }
  });

  test("expand preview opens a closeable overlay", async ({ page }, info) => {
    test.skip(!isMobileProject(info.project.name), "Expand preview is mobile-only");
    await openLook(page, "en");
    await clickId(page, "tpl-orientation-portrait");
    await revealLook(page);
    await clickId(page, "tpl-expand-preview");
    const overlay = page.getByTestId("tpl-preview-overlay");
    await expect(overlay).toBeVisible();
    await expect(page.getByTestId("tpl-preview-close")).toBeVisible();
    const bodyWhileOpen = await page.evaluate(() => getComputedStyle(document.body).overflow);
    expect(bodyWhileOpen).toBe("hidden");
    const overlayBoard = await page.evaluate(() => {
      const board = document.querySelector("[data-testid=tpl-preview-overlay] .tpl-board") as HTMLElement | null;
      if (!board) return null;
      const r = board.getBoundingClientRect();
      return { w: r.width, h: r.height, ratio: r.width / r.height, inView: r.top >= 0 && r.bottom <= innerHeight + 8 };
    });
    expect(overlayBoard).toBeTruthy();
    expect(overlayBoard!.ratio).toBeGreaterThan(0.54);
    expect(overlayBoard!.ratio).toBeLessThan(0.58);
    expect(overlayBoard!.inView).toBe(true);

    await page.getByTestId("tpl-preview-close").click();
    await expect(overlay).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");

    await clickId(page, "tpl-expand-preview");
    await expect(page.getByTestId("tpl-preview-overlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tpl-preview-overlay")).toHaveCount(0);

    await clickId(page, "tpl-expand-preview");
    await expect(page.getByTestId("tpl-preview-overlay")).toBeVisible();
    await page.locator(".ps-dialog-backdrop").click({ position: { x: 4, y: 4 } });
    await expect(page.getByTestId("tpl-preview-overlay")).toHaveCount(0);
  });

  test("all four editor steps stay reachable and survive a toolbar-like resize", async ({ page }, info) => {
    test.skip(!isMobileProject(info.project.name), "Mobile viewport regression");
    await openLook(page, "en");
    await clickId(page, "tpl-orientation-portrait");
    for (const step of ["tpl-step-0", "tpl-step-1", "tpl-step-2", "tpl-step-3"]) {
      await clickId(page, step);
      await page.getByTestId(step).evaluate((el: HTMLElement) => el.scrollIntoView({ block: "center" }));
      await expect(page.getByTestId(step)).toBeVisible();
    }
    await expect(page.getByTestId("tpl-orientation")).toBeVisible();
    // Simulate iOS toolbar showing (viewport shortens) and hiding (it lengthens).
    const size = page.viewportSize();
    if (size) {
      await page.setViewportSize({ width: size.width, height: Math.max(500, size.height - 80) });
      await revealLook(page);
      const short = await metrics(page);
      expect(short.boardRatio).toBeGreaterThan(0.54);
      expect(short.boardRatio).toBeLessThan(0.58);
      expect(short.board!.height).toBeLessThanOrEqual(Math.ceil(short.vh * 0.55) + 2);
      expect(short.lookCovered).toBe(false);
      await page.setViewportSize(size);
      await revealLook(page);
      const restored = await metrics(page);
      expect(restored.lookCovered).toBe(false);
      expect(restored.expandVisible).toBe(true);
    }
  });
});

test.describe("Spanish copy", () => {
  test("expand and close use the Spanish strings", async ({ page }, info) => {
    test.skip(!isMobileProject(info.project.name), "Mobile-only control");
    await page.context().addCookies([{ name: "pekko_locale", value: "es", url: "http://localhost:3050" }]);
    await page.goto(EDITOR, { waitUntil: "networkidle", timeout: 60_000 });
    await clickId(page, "tpl-step-3");
    await page.getByTestId("tpl-orientation").waitFor();
    await clickId(page, "tpl-orientation-portrait");
    await revealLook(page);
    await expect(page.getByTestId("tpl-expand-preview")).toHaveText("Ampliar vista previa");
    await clickId(page, "tpl-expand-preview");
    await expect(page.getByTestId("tpl-preview-close")).toHaveText("Cerrar vista previa");
    await page.getByTestId("tpl-preview-close").click();
    await expect(page.getByTestId("tpl-preview-overlay")).toHaveCount(0);
  });
});
