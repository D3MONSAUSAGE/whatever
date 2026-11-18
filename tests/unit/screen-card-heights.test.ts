import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

async function launch() {
  try {
    const { chromium } = await import("@playwright/test");
    try {
      return await chromium.launch({ timeout: 20000 });
    } catch {
      // Machines with a preinstalled Chromium outside Playwright's cache.
      return await chromium.launch({ timeout: 20000, executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
    }
  } catch {
    return null;
  }
}

describe("My Screens: equal-height cards with aligned actions", () => {
  const src = () => readFileSync("components/my-screens.tsx", "utf8");

  it("stretches each card to its grid row and pins the action row to the bottom", () => {
    const s = src();
    expect(s).toContain('<ul className="grid gap-3 xl:grid-cols-2 items-stretch" data-testid="screen-cards">');
    expect(s).toContain('<li key={display.id} className="min-w-0 flex" data-testid="screen-card">');
    expect(s).toContain('<article className="card p-4 min-w-0 w-full flex flex-col">');
    expect(s).toContain('<div className="mt-auto pt-3 flex items-center gap-2" data-testid="screen-card-actions">');
    // No fixed heights to force the match.
    expect(s).not.toMatch(/screen-card"[^>]*\bh-\[/);
  });

  it("keeps the offline explanation and wraps long names and content instead of cutting them off", () => {
    const s = src();
    expect(s).toContain('{display.connected && !display.online ? (\n                  <p className="text-sm mt-2">{t("screens.offlineCard")}</p>');
    expect(s).toContain('<h2 className="font-semibold break-words min-w-0">{display.name}</h2>');
    expect(s).toContain('<p className="text-sm mt-2 break-words">{contentLabel(display, t)}</p>');
  });

  it("in a browser: an online card matches the taller offline card next to it, and actions line up; one column stacks naturally", async (ctx) => {
    const browser = await launch();
    if (!browser) return ctx.skip("Chromium is not available");
    const card = (id: string, name: string, extra: string) => `
      <li id="${id}" style="min-width:0;display:flex"><article style="padding:16px;width:100%;display:flex;flex-direction:column;border:1px solid #ccc">
        <div style="display:flex;gap:12px"><div style="flex:1;min-width:0"><h2 style="margin:0;overflow-wrap:anywhere">${name}</h2><p>Lunch loop</p></div><div style="width:128px;height:72px;flex-shrink:0;background:#222"></div></div>
        ${extra}
        <div class="act" style="margin-top:auto;padding-top:12px;display:flex"><button style="height:44px">Change content</button></div>
      </article></li>`;
    const html = (cols: string) => `<!doctype html><style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}</style>
      <ul style="display:grid;grid-template-columns:${cols};gap:12px;align-items:stretch;list-style:none;padding:0;margin:0">
        ${card("a", "Front counter", "")}
        ${card("b", "Bar TV", "<p>This screen is offline. You can still change content; the TV updates when it comes back online.</p>")}
        ${card("c", "A very long screen name that wraps onto a second and maybe a third line in a narrow column", "")}
        ${card("d", "Kitchen", "")}
      </ul>`;
    const measure = () => [..."abcd"].map((id) => {
      const li = document.getElementById(id)!;
      const box = li.querySelector("article")!.getBoundingClientRect();
      return { top: box.top, height: box.height, act: li.querySelector(".act")!.getBoundingClientRect().bottom, bottom: box.bottom };
    });
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    await page.setContent(html("repeat(2, minmax(0, 1fr))"));
    const two = await page.evaluate(measure);
    expect(two[0].height).toBe(two[1].height); // online card grows to the offline card
    expect(two[0].act).toBe(two[1].act); // action rows line up
    expect(two[2].height).toBe(two[3].height);
    for (const c of two) expect(c.bottom - c.act).toBeLessThanOrEqual(17); // actions at the bottom, no gap
    expect(two[0].height).toBeLessThan(two[2].height + 200); // no runaway empty space
    await page.setContent(html("minmax(0, 1fr)"));
    const one = await page.evaluate(measure);
    expect(one[0].height).toBeLessThan(one[1].height); // stacked cards keep their natural heights
    await browser.close();
  });
});
