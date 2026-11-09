import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("studio phone frame", () => {
  it("keeps a 390px page inside the viewport when a browser is available", async () => {
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
    const source = readFileSync("components/layout-studio.tsx", "utf8");
    const style = source.match(/<style>\{`([\s\S]*?)`\}<\/style>/)?.[1] ?? "";
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}${style}</style>
      <main class="studio-app">
        <div class="studio-grid">
          <section class="studio-preview" aria-label="TV preview"><figure><div style="aspect-ratio:16/9;background:#000"></div></figure></section>
          <section class="studio-controls"><div class="studio-pane on" style="width:900px">wide controls</div></section>
        </div>
        <nav class="studio-tabs"><button>Template</button><button>Section</button><button>Content</button><button>Style</button><button>Publish</button></nav>
      </main>`);
    const metrics = await page.evaluate(() => {
      const tab = document.querySelector(".studio-tabs button");
      const preview = document.querySelector(".studio-preview");
      return {
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        sticky: preview ? getComputedStyle(preview).position : "",
        tab: tab ? tab.getBoundingClientRect().height : 0,
      };
    });
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.client + 1);
    expect(metrics.sticky).toBe("sticky");
    expect(metrics.tab).toBeGreaterThanOrEqual(44);
    await browser.close();
  });
});
