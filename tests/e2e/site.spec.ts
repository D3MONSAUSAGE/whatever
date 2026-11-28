import { expect, test, type Page } from "@playwright/test";

/** Public marketing site: shared nav, footer, routes and sign-up entry, on desktop and mobile. */
const PAGES = ["/", "/features", "/pricing", "/faq", "/support", "/contact", "/terms", "/privacy", "/account-deletion"];
const NAV = [["Home", "/"], ["Features", "/features"], ["Pricing", "/pricing"], ["FAQ", "/faq"], ["Login", "/login"]] as const;
/** Peek marketing site (docs/MARKETING_PEEK.md): the logo is the home link and Features/Pricing/FAQ open those sections on the home page. */
const NAV_PEEK = [["Features", "/", "#features"], ["Pricing", "/", "#pricing"], ["FAQ", "/", "#faq"], ["Login", "/login", ""]] as const;
const isPeek = async (page: Page) => (await page.getByTestId("pkm-root").count()) > 0;
/** The trial CTA label: "Start Free Trial" on the current site, "Create my free menu" on the Peek site (approved). */
const TRIAL_LABEL = /^(Start Free Trial|Create my free menu)$/;
/** The sign-up page heading (components/auth/signup-view.tsx, auth.up.title). */
const SIGNUP_HEADING = /Create your (account|free menu)/;
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
        // The trial link is /signup, or /create on the Peek pages when GUEST_EDITOR is on.
        for (const href of FOOTER) await expect(page.getByTestId("site-footer").locator(href === "/signup" ? 'a[href="/signup"], a[href="/create"]' : `a[href="${href}"]`)).toHaveCount(1);
        const text = await page.locator("body").innerText();
        expect(text, p).not.toMatch(/Technologies/i);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), p).toBe(true);
      }
      expect(errors).toEqual([]);
    });

    test("nav links work", async ({ page }) => {
      await page.goto("/faq");
      if (await isPeek(page)) {
        for (const [label, href, hash] of NAV_PEEK) {
          await page.goto("/faq");
          if (mobile) {
            await page.getByTestId("menu-toggle").click();
            await expect(page.getByTestId("menu-toggle")).toHaveAttribute("aria-expanded", "true");
            await page.locator("#mobile-menu").getByRole("link", { name: label, exact: true }).click();
          } else {
            await page.getByTestId("site-nav").getByRole("link", { name: label, exact: true }).click();
          }
          await page.waitForURL((u) => u.pathname === href && u.hash === hash);
          if (mobile) await expect(page.locator("#mobile-menu")).toHaveCount(0);
        }
        await page.goto("/faq");
        await page.getByTestId("site-nav").getByRole("link", { name: "Pekko home" }).click();
        await page.waitForURL((u) => u.pathname === "/");
        return;
      }
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

    test("Start Free Trial opens sign-up (or the guest menu designer when GUEST_EDITOR is on)", async ({ page }) => {
      await page.goto("/");
      const guest = (await page.locator('[data-testid="hero-cta"]').first().getAttribute("href")) === "/create";
      if (mobile) {
        await page.getByTestId("menu-toggle").click();
        await page.locator("#mobile-menu").getByRole("link", { name: TRIAL_LABEL }).click();
      } else {
        await page.getByTestId("nav-trial").click();
      }
      if (guest) {
        // No account needed to start: the real editor's design gallery opens.
        await page.waitForURL((u) => u.pathname === "/create");
        await expect(page.getByTestId("guest-gallery")).toBeVisible();
        await page.goto("/signup");
      }
      await page.waitForURL(/\/login\?mode=up/);
      await expect(page.getByRole("heading", { name: SIGNUP_HEADING })).toBeVisible();
      const legal = page.getByTestId("signup-legal");
      await expect(legal).toBeVisible();
      await expect(legal.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
      await expect(legal.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
      await page.goto("/");
      await page.locator('[data-testid="start-trial"], [data-testid="hero-cta"]').first().click();
      if (guest) await page.waitForURL((u) => u.pathname === "/create");
      else await page.waitForURL(/\/login\?mode=up/);
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
      // Marketing copy must not promise online payment. The per-plan billing status line (data-testid="buy-*",
      // "Online checkout coming soon" until Stripe checkout is configured) is billing UI, not a claim, so it is left out.
      const marketingText = await page.locator("main").evaluate((m) => {
        const copy = m.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('[data-testid^="buy-"]').forEach((el) => el.remove());
        return copy.innerText ?? copy.textContent ?? "";
      });
      expect(marketingText).not.toMatch(/checkout|pay online|credit card required/i);
      await page.goto("/faq");
      const q = page.getByText("What happens when the trial ends?");
      await q.click();
      await expect(page.getByText(/never deleted when a trial ends/)).toBeVisible();
    });
  });
}
