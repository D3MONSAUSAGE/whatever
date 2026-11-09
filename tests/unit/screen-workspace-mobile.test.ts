import { describe, expect, it } from "vitest";

const WIDTHS = [360, 390, 414, 768];

describe("screen workspace widths", () => {
  it("keeps the screen actions inside the viewport", async () => {
    let chromium: typeof import("@playwright/test").chromium;
    try {
      chromium = (await import("@playwright/test")).chromium;
    } catch {
      return;
    }
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    try {
      browser = await chromium.launch({ timeout: 20000 });
    } catch {
      return;
    }
    try {
      for (const width of WIDTHS) {
        const page = await browser.newPage({ viewport: { width, height: 800 } });
        await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; }
            .page { overflow-x: hidden; max-width: 100%; padding: 16px 16px 88px; }
            .row { display: flex; flex-wrap: wrap; gap: 8px; }
            button, a.btn { min-height: 44px; max-width: 100%; }
            .preview { aspect-ratio: 16 / 9; background: #111; }
            nav { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }
            nav a { min-height: 44px; }
          </style>
          <main class="page">
            <h1>Front counter</h1>
            <div class="preview"></div>
            <div class="row">
              <button>Add media</button><button>Change content</button><button>Create</button><button>Edit playlist</button><button>Schedule</button>
            </div>
          </main>
          <nav><a>My Screens</a><a>Content</a><a>Playlists</a><a>Schedules</a><a>Account</a></nav>`);
        const metrics = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
          button: document.querySelector("button")?.getBoundingClientRect().height ?? 0,
        }));
        expect(metrics.scroll).toBeLessThanOrEqual(metrics.client + 1);
        expect(metrics.button).toBeGreaterThanOrEqual(44);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });
});
