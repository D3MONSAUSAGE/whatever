import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SERIES, ORDINAL_BLUE, NEUTRAL } from "@/components/developer/charts";

/**
 * Peek on the web Developer Console (t428u): presentation only, behind the same flag as the web app.
 * The UI harness (synthetic session + fixture API responses) compares text, chart data and API requests
 * old vs new; these checks keep the gating and scoping from drifting.
 */
const css = readFileSync("components/developer/console-peek.css", "utf8");
const client = readFileSync("app/developer/analytics/client.tsx", "utf8");

function selectors(src: string): string[] {
  const body = src.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  // Top-level rule preludes and preludes inside @media blocks.
  for (const m of body.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const prelude = m[1].trim();
    if (!prelude || prelude.startsWith("@")) continue;
    out.push(...prelude.replace(/^@media[^{]*\{/, "").split(",").map((s) => s.trim()).filter(Boolean));
  }
  return out;
}

describe("Developer Console in Peek", () => {
  it("scopes every Peek rule to body.peek .dc-peek, so Peek off keeps the current console", () => {
    const list = selectors(css);
    expect(list.length).toBeGreaterThan(60);
    for (const s of list) expect(s, s).toMatch(/^body\.peek \.dc-peek(\s|$|\.|\[|:)/);
    // Colours come from the Peek tokens (dark stays opt-in through them).
    expect(css).toContain("var(--pk-primary)");
    expect(css).not.toMatch(/data-theme="dark"/);
  });

  it("uses the web app's Peek flag and adds the body tokens only after a developer is confirmed", () => {
    expect(client).toContain('import "@/components/developer/console-peek.css";');
    expect(client).toContain("const peek = usePeekWeb();");
    expect(client).toContain("usePeekBodyClass(peek && confirmed);");
    expect(client).toContain('className={peek ? "mk dc dc-peek" : "mk dc"}');
    // The not-found return comes before the console markup; the developer gate itself is unchanged.
    const notFound = client.indexOf('if (load.state === "notFound" || denied) return <>{notFound}</>;');
    const confirmedGate = client.indexOf("if (!confirmed) {");
    const consoleMarkup = client.indexOf('data-testid="dev-analytics"');
    expect(notFound).toBeGreaterThan(0);
    expect(confirmedGate).toBeGreaterThan(notFound);
    expect(consoleMarkup).toBeGreaterThan(confirmedGate);
    expect(client).toContain("{peek ? <PeekLockup height={34} /> :");
  });

  it("keeps the validated chart palette (same as the Flutter Developer screen)", () => {
    expect(SERIES).toEqual(["#3987e5", "#d95926", "#199e70"]);
    expect(ORDINAL_BLUE).toEqual(["#9ec5f4", "#5598e7", "#256abf", "#184f95"]);
    expect(NEUTRAL).toBe("#5b6476");
  });
});
