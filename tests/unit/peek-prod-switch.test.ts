import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PEEK_COOKIE, peekAllowedForBuild, peekDefaultForBuild, peekOptedIn } from "@/lib/peek-gate";

// t425u: Peek on for all web app users in Production behind one env var kill switch (PEEK_WEB_PRODUCTION=on).
describe("Peek production kill switch", () => {
  it("is default-on only for Production with the switch on", () => {
    expect(peekDefaultForBuild({ VERCEL_ENV: "production", PEEK_WEB_PRODUCTION: "on" })).toBe("1");
    expect(peekDefaultForBuild({ VERCEL_ENV: "production", PEEK_WEB_PRODUCTION: " ON " })).toBe("1");
    expect(peekDefaultForBuild({ VERCEL_ENV: "production", PEEK_WEB_PRODUCTION: "off" })).toBe("0");
    expect(peekDefaultForBuild({ VERCEL_ENV: "production" })).toBe("0");
    expect(peekDefaultForBuild({ VERCEL_ENV: "preview", PEEK_WEB_PRODUCTION: "on" })).toBe("0");
    expect(peekDefaultForBuild({})).toBe("0");
  });
  it("switch off means the Production build cannot render Peek at all", () => {
    expect(peekAllowedForBuild({ VERCEL_ENV: "production", PEEK_WEB_PRODUCTION: "off" })).toBe("0");
    expect(peekAllowedForBuild({ VERCEL_ENV: "production" })).toBe("0");
  });
  it("visitors can opt out with ?peek=0 (remembered by cookie) when default-on", () => {
    expect(peekOptedIn("", null, true)).toBe(true);
    expect(peekOptedIn("", "0", true)).toBe(false);
    expect(peekOptedIn(`a=1; ${PEEK_COOKIE}=0`, null, true)).toBe(false);
    expect(peekOptedIn(`${PEEK_COOKIE}=0`, "1", true)).toBe(true);
    expect(peekOptedIn("", null, false)).toBe(false);
  });
  it("the hook stores ?peek=0 as an explicit opt-out cookie and reads the build default", () => {
    const src = readFileSync("lib/peek-flag.ts", "utf8");
    expect(src).toContain("document.cookie = `${PEEK_COOKIE}=${q}; Path=/;");
    expect(src).toContain("peekDefaultOn()");
    expect(readFileSync("next.config.ts", "utf8")).toContain("PEEK_WEB_DEFAULT: peekDefaultForBuild(process.env)");
  });
  it("dark mode stays opt-in (light by default)", () => {
    expect(readFileSync("lib/peek-gate.ts", "utf8")).toContain('?? "light"');
  });
});
