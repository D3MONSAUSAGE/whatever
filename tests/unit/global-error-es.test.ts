import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GlobalError from "@/app/global-error";
import { GlobalErrorView } from "@/components/global-error-view";
import { globalErrorLocale } from "@/lib/global-error-locale";

const noop = () => {};
const html = (locale: "en" | "es", digest?: string) =>
  renderToStaticMarkup(createElement(GlobalErrorView, { locale, digest, reset: noop }));

describe("R14-01 global error page language", () => {
  it("keeps the English text unchanged", () => {
    const out = html("en", "abc123");
    expect(out).toContain('<html lang="en">');
    expect(out).toContain("Pekko is having trouble");
    expect(out).toContain("Your screens keep playing. Try again in a moment. Code: abc123");
    expect(out).toContain(">Try again</button>");
  });
  it("shows Spanish (usted) when pekko_locale=es", () => {
    const out = html("es", "abc123");
    expect(out).toContain('<html lang="es">');
    expect(out).toContain("Pekko tiene problemas");
    expect(out).toContain("Sus pantallas siguen funcionando. Intente de nuevo en un momento. Código: abc123");
    expect(out).toContain(">Intentar de nuevo</button>");
    expect(out).not.toMatch(/having trouble|Try again/);
  });
  it("omits the code when there is no digest", () => {
    expect(html("es")).not.toContain("Código");
    expect(html("en")).not.toContain("Code:");
  });
  it("reads the cookie, English when unset or unknown", () => {
    expect(globalErrorLocale("a=1; pekko_locale=es")).toBe("es");
    expect(globalErrorLocale("pekko_locale=en")).toBe("en");
    expect(globalErrorLocale("pekko_locale=fr")).toBe("en");
    expect(globalErrorLocale("")).toBe("en");
    expect(globalErrorLocale(undefined)).toBe("en");
  });
  it("server render falls back to English (no document)", () => {
    const out = renderToStaticMarkup(createElement(GlobalError, { error: Object.assign(new Error("x"), { digest: "d1" }), reset: noop }));
    expect(out).toContain('<html lang="en">');
    expect(out).toContain("Code: d1");
  });
});
