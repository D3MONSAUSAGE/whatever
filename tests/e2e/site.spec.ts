import { expect, test, type Page } from "@playwright/test";

/** Public marketing site: shared nav, footer, routes and sign-up entry, on desktop and mobile. */
const PAGES = ["/", "/features", "/pricing", "/faq", "/support", "/contact", "/terms", "/privacy", "/account-deletion"];
const NAV = [["Home", "/"], ["Features", "/features"], ["Pricing", "/pricing"], ["FAQ", "/faq"], ["Login", "/login"]] as const;
const FOOTER = ["/features", "/pricing", "/faq", "/signup", "/login", "/support", "/contact", "/terms", "/privacy", "/account-deletion"];

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

for (const vp of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    const mobile = vp.name === "mobile";

    test("every public page has nav + footer, no overflow, no console errors", async ({ page }) => {
      const errors = trackErrors(page);
      for (const p of PAGES) {
        const r = await page.goto(p);
        expect(r?.status(), p).toBe(200);
        await expect(page.getByTestId("site-nav")).toBeVisible();
        await expect(page.getByTestId("site-footer")).toBeVisible();
        for (const href of FOOTER) await expect(page.getByTestId("site-footer").locator(`a[href="${href}"]`)).toHaveCount(1);
        const text = await page.locator("body").innerText();
        expect(text, p).not.toMatch(/Technologies/i);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), p).toBe(true);
      }
      expect(errors).toEqual([]);
    });

    test("nav links work", async ({ page }) => {
      for (const [label, href] of NAV) {
        await page.goto("/faq");
        if (mobile) {
          await page.getByTestId("menu-toggle").click();
          await expect(page.getByTestId("menu-toggle")).toHaveAttribute("aria-expanded", "true");
          await page.locator("#mobile-menu").getByRole("link", { name: label, exact: true }).click();
        } else {
          await page.getByTestId("site-nav").getByRole("link", { name: label, exact: true }).click();
        }
        await page.waitForURL((u) => u.pathname === href);
        if (mobile) await expect(page.locator("#mobile-menu")).toHaveCount(0);
      }
    });

    test("Start Free Trial opens sign-up", async ({ page }) => {
      await page.goto("/");
      if (mobile) {
        await page.getByTestId("menu-toggle").click();
        await page.locator("#mobile-menu").getByRole("link", { name: "Start Free Trial" }).click();
      } else {
        await page.getByTestId("nav-trial").click();
      }
      await page.waitForURL(/\/login\?mode=up/);
      await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
      await page.goto("/");
      await page.getByTestId("start-trial").click();
      await page.waitForURL(/\/login\?mode=up/);
    });

    test("mobile menu closes with Escape", async ({ page }) => {
      test.skip(!mobile);
      await page.goto("/");
      await page.getByTestId("menu-toggle").click();
      await expect(page.locator("#mobile-menu")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("#mobile-menu")).toHaveCount(0);
    });

    test("pricing and FAQ content", async ({ page }) => {
      await page.goto("/pricing");
      for (const [id, price, screens] of [["starter", "$19", "1 screen"], ["business", "$39", "Up to 3 screens"], ["multi", "$59", "Up to 5 screens"]]) {
        await expect(page.getByTestId(`plan-${id}`)).toContainText(price);
        await expect(page.getByTestId(`plan-${id}`)).toContainText(screens);
      }
      expect(await page.locator("main").innerText()).not.toMatch(/checkout|pay online|credit card required/i);
      await page.goto("/faq");
      const q = page.getByText("What happens when the trial ends?");
      await q.click();
      await expect(page.getByText(/never deleted when a trial ends/)).toBeVisible();
    });
  });
}
