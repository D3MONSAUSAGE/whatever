import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ createdAt: null as string | null, locale: null as string | null }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));
vi.mock("@/lib/supabase-browser", () => ({ supabaseConfigured: () => false, getSupabase: () => { throw new Error("no supabase in tests"); } }));
vi.mock("@/lib/server/auth", () => ({ requireAdmin: async () => ({ accountId: "acct-1", email: "owner@example.com" }) }));
vi.mock("@/lib/server/supabase", () => ({
  BUCKET: "media",
  db: () => ({
    from: () => ({
      select: (cols: string) => ({
        eq: () => ({
          single: async () => ({ data: { name: "QA Café", created_at: state.createdAt }, error: null, cols }),
          maybeSingle: async () => ({ data: { locale: state.locale }, error: null }),
        }),
      }),
    }),
  }),
}));

import { LocaleProvider } from "@/lib/i18n/client";
import { ENGLISH_ONLY, makeT } from "@/lib/i18n/index";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { isNewAccount, NEW_ACCOUNT_WINDOW_MS, type Locale } from "@/lib/i18n/locales";
import { shouldAdoptDeviceLocale } from "@/components/i18n/account-locale-sync";
import { discardRequest, useConfirmDiscard } from "@/components/studio-leave";
import { NotFoundActions } from "@/components/not-found-actions";
import { remainingWait, resendOutcome, RESEND_UNTIL_KEY } from "@/components/auth/resend-confirmation";
import LoginPage from "@/app/login/page";
import AuthConfirmPage from "@/app/auth/confirm/page";
import { GET as getMe } from "@/app/api/me/route";

const render = (locale: Locale, child: ReturnType<typeof h>) => renderToStaticMarkup(h(LocaleProvider, { initial: locale, children: child }));

describe("I18N-1F-01/02: FAQ questions in Spanish, billing answers stay English", () => {
  it("translates the four questions; only answers are English-only", () => {
    expect(es["faq.trial.q"]).toBe("¿Cómo funciona la prueba gratis?");
    expect(es["faq.trialEnd.q"]).toBe("¿Qué pasa cuando termina la prueba?");
    expect(es["faq.plans.q"]).toBe("¿Qué planes hay?");
    expect(es["faq.cancel.q"]).toBe("¿Puedo cancelar o eliminar mi cuenta?");
    expect(ENGLISH_ONLY.every((k) => k.endsWith(".a"))).toBe(true);
    for (const k of ENGLISH_ONLY) expect(es[k]).toBe(en[k]);
  });
  it("marks lang=\"en\" on the answer, not the whole question card", () => {
    const src = readFileSync("components/site/sections.tsx", "utf8");
    expect(src).toContain('<p className="mt-2 text-sm leading-relaxed text-muted" lang={englishOnly(k.a) ?? (locale === "en" && BILLING_ANSWERS.includes(k.a) ? "en" : undefined)}>');
    expect(src).not.toContain('className="card p-5 group" lang=');
  });
});

describe("I18N-1F-03: Pekko tagline", () => {
  it("replaces the leftover Seemple line", () => {
    expect(en["brand.tagline"]).toBe("Digital signage made simple");
    expect(es["brand.tagline"]).toBe("Señalización digital sencilla");
    expect(JSON.stringify([en, es])).not.toMatch(/making life simpler|vida más simple/);
  });
});

describe("I18N-1F-04: /auth/confirm offers a new confirmation email", () => {
  it("an unusable link leads with Resend confirmation (ES), reset is secondary", () => {
    const html = render("es", h(AuthConfirmPage));
    expect(html).toContain('data-testid="confirm-resend"');
    expect(html).toContain("Reenviar correo de confirmación");
    expect(html).toMatch(/<input id="confirm-resend-email"[^>]*autoComplete="email"/);
    expect(html).toContain('for="confirm-resend-email"');
    expect(html.indexOf("confirm-resend")).toBeLessThan(html.indexOf("confirm-reset-link"));
    expect(html).not.toMatch(/class="btn btn-primary w-full" href="\/forgot-password"/);
  });
  it("page-only change: no auth.ts or template edits; same resend call as /login", () => {
    const src = readFileSync("components/auth/resend-confirmation.tsx", "utf8");
    expect(src).toContain('auth.resend({ type: "signup"');
    expect(src).toContain("safeDashboardNext");
  });
});

describe("I18N-1F-05: 404 has the public nav, language selector and a signed-out CTA", () => {
  it("uses the public shell", () => {
    const src = readFileSync("app/not-found.tsx", "utf8");
    expect(src).toContain("<PublicPage>");
    expect(readFileSync("components/public-page.tsx", "utf8")).toContain("<SiteNav labels={labels} />");
  });
  it("signed out (default): home + login, no dashboard", () => {
    const html = render("es", h(NotFoundActions, { labels: { dashboard: es["common.goToDashboard"], home: es["error.goHome"], login: es["nav.login"] } }));
    expect(html).toContain("Ir a la página de inicio");
    expect(html).toContain('data-testid="not-found-login"');
    expect(html).not.toContain("Ir al panel");
  });
});

describe("I18N-1F-06: /login fields password managers can find, in any language", () => {
  for (const locale of ["en", "es"] as const) {
    it(`stable name/id/autocomplete and label-for (${locale})`, () => {
      const html = render(locale, h(LoginPage));
      expect(html).toMatch(/<label for="login-email"[^>]*>/);
      expect(html).toMatch(/<label for="login-password"[^>]*>/);
      const tag = (id: string) => html.match(new RegExp(`<input id="${id}"[^>]*>`))?.[0] ?? "";
      expect(tag("login-email")).toContain('name="email"');
      expect(tag("login-email")).toContain('autoComplete="email"');
      expect(tag("login-password")).toContain('name="password"');
      expect(tag("login-password")).toContain('autoComplete="current-password"');
      expect(html).toContain(locale === "es" ? "Contraseña" : "Password");
    });
  }
});

describe("I18N-1F-07: the device language is adopted only by a new account", () => {
  const now = Date.parse("2026-11-15T04:00:00Z");
  it("isNewAccount", () => {
    expect(isNewAccount(new Date(now - 60_000).toISOString(), now)).toBe(true);
    expect(isNewAccount(new Date(now - NEW_ACCOUNT_WINDOW_MS - 1).toISOString(), now)).toBe(false);
    expect(isNewAccount(null, now)).toBe(false);
    expect(isNewAccount("not a date", now)).toBe(false);
  });
  it("shouldAdoptDeviceLocale", () => {
    expect(shouldAdoptDeviceLocale({ localeChosen: false, newAccount: true }, "es")).toBe(true);
    expect(shouldAdoptDeviceLocale({ localeChosen: false, newAccount: false }, "es")).toBe(false); // Harbor's case
    expect(shouldAdoptDeviceLocale({ localeChosen: false }, "es")).toBe(false); // older API / Android parity
    expect(shouldAdoptDeviceLocale({ localeChosen: true, newAccount: true }, "es")).toBe(false);
    expect(shouldAdoptDeviceLocale({ localeChosen: false, newAccount: true }, "en")).toBe(false);
  });
  beforeEach(() => { state.createdAt = null; state.locale = null; });
  it("GET /api/me adds newAccount without changing the other fields", async () => {
    state.createdAt = new Date(Date.now() - 3_600_000).toISOString();
    let body = await (await getMe(new Request("https://pekkotv.com/api/me", { headers: { authorization: "Bearer x" } }))).json();
    expect(body).toEqual({ email: "owner@example.com", accountName: "QA Café", locale: "en", localeChosen: false, newAccount: true });
    state.createdAt = "2026-11-01T00:00:00Z";
    state.locale = "es";
    body = await (await getMe(new Request("https://pekkotv.com/api/me", { headers: { authorization: "Bearer x" } }))).json();
    expect(body).toMatchObject({ locale: "es", localeChosen: true, newAccount: false });
  });
});

describe("Menu editor leave guard through t() (Gother's Android Spanish)", () => {
  it("dialog copy", () => {
    expect(discardRequest(makeT("es"))).toMatchObject({
      title: "¿Descartar los cambios sin guardar?",
      body: "Tiene cambios sin guardar. Si sale de este menú digital, se perderán esos cambios.",
      cancelLabel: "Seguir editando",
      confirmLabel: "Descartar cambios",
    });
    expect(discardRequest(makeT("en"))).toMatchObject({ title: "Discard unsaved changes?", cancelLabel: "Keep editing", confirmLabel: "Discard changes" });
  });
  it("proceeds at once when clean, never when dirty and unconfirmed", () => {
    const calls: string[] = [];
    function Probe() {
      const confirmDiscard = useConfirmDiscard();
      confirmDiscard(false, () => calls.push("clean"));
      confirmDiscard(true, () => calls.push("dirty"));
      return null;
    }
    render("es", h(Probe));
    expect(calls).toEqual(["clean"]);
  });
  it("Classic and Studio editors no longer call the raw English confirm", () => {
    for (const f of ["components/classic-editor.tsx", "components/layout-studio.tsx", "components/shell.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toContain("confirmDiscardUnsaved(");
      expect(src).not.toContain("window.confirm(");
    }
  });
});

describe("Gother #110 MEDIUM: the confirmation resend doesn't reveal whether an email is registered", () => {
  it("every outcome reads as sent, except a mapped rate limit", () => {
    expect(resendOutcome(null)).toBe("sent");
    expect(resendOutcome({ message: "User not found" })).toBe("sent");
    expect(resendOutcome({ message: "Email address is invalid" })).toBe("sent");
    expect(resendOutcome({ message: "Failed to fetch" })).toBe("sent");
    expect(resendOutcome({ message: "Email rate limit exceeded" })).toBe("rateLimit");
    expect(resendOutcome({ message: "For security purposes, you can only request this after 42 seconds." })).toBe("rateLimit");
  });
  it("never shows Supabase text and starts the wait on every outcome", () => {
    const src = readFileSync("components/auth/resend-confirmation.tsx", "utf8");
    expect(src).not.toContain("friendlyAuthError");
    expect(src).not.toContain("note.text");
    expect(src).toMatch(/finally \{\s*\/\/ The wait starts on every outcome, success or failure\.\s*setWait\(startWait\(\)\);/);
  });
  it("the 60 s wait survives a refresh (sessionStorage)", () => {
    const now = 1_000_000;
    const store = (v: string | null) => ({ getItem: (k: string) => (k === RESEND_UNTIL_KEY ? v : null) });
    expect(remainingWait(now, store(String(now + 42_000)))).toBe(42);
    expect(remainingWait(now, store(String(now - 1)))).toBe(0);
    expect(remainingWait(now, store(null))).toBe(0);
    expect(remainingWait(now, store("junk"))).toBe(0);
    expect(remainingWait(now, null)).toBe(0);
  });
});

describe("Gother #110 LOW: site metadata uses the Pekko line", () => {
  it("no Seemple line in layout or manifest", () => {
    for (const f of ["app/layout.tsx", "app/manifest.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/making life simpler/i);
      expect(src).toContain("Digital signage made simple");
    }
  });
});
