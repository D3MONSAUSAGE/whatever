import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PEEK_THEME_COOKIE, peekResolvedTheme, peekThemeChoice } from "@/lib/peek-gate";

describe("Peek dark mode opt-in (build step 10)", () => {
  it("defaults to light with no choice", () => {
    expect(peekThemeChoice("", null)).toBe("light");
    expect(peekThemeChoice("pekko_peek=1", null)).toBe("light");
    expect(peekThemeChoice(`${PEEK_THEME_COOKIE}=bogus`, null)).toBe("light");
  });
  it("the query wins over the cookie, and the cookie is remembered", () => {
    expect(peekThemeChoice(`${PEEK_THEME_COOKIE}=dark`, null)).toBe("dark");
    expect(peekThemeChoice(`a=1; ${PEEK_THEME_COOKIE}=system`, null)).toBe("system");
    expect(peekThemeChoice(`${PEEK_THEME_COOKIE}=dark`, "light")).toBe("light");
    expect(peekThemeChoice("", "dark")).toBe("dark");
  });
  it("system follows the device", () => {
    expect(peekResolvedTheme("system", true)).toBe("dark");
    expect(peekResolvedTheme("system", false)).toBe("light");
    expect(peekResolvedTheme("dark", false)).toBe("dark");
    expect(peekResolvedTheme("light", true)).toBe("light");
  });
  it("uses the exact core dark tokens from 02-TOKENS", () => {
    const css = readFileSync("app/peek.css", "utf8");
    const dark = css.slice(css.indexOf('body.peek[data-theme="dark"] {'));
    for (const v of ["--pk-surface: #211936", "--pk-text: #FBF4E8", "--pk-primary: #B9A6FF", "--pk-accent: #FFC53D", "--pk-live: #4FE0B0", "--pk-error: #FF8A80", "--pk-eye-ink: #251A3A"]) expect(dark).toContain(v);
  });
  it("only the Peek body hook sets the theme; the theme never applies without the Peek flag", () => {
    const src = readFileSync("lib/peek-flag.ts", "utf8");
    const body = src.slice(src.indexOf("export function usePeekBodyClass(on: boolean)"));
    expect(body.indexOf("if (!on) return;")).toBeGreaterThan(0);
    expect(body.indexOf("if (!on) return;")).toBeLessThan(body.indexOf("document.body.dataset.theme"));
  });
});
