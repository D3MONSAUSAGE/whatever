import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { homeVariant } from "@/lib/home-variant";
import { DEMO_TEMPLATES, HERO_TEMPLATES, heroImage } from "@/lib/marketing-home";
import { designById } from "@/lib/menu-designs";
import { reduceFunnelEvent, signupErrorCode } from "@/lib/funnel";
import { buildFunnel } from "@/lib/server/traffic-report";
import { signupProblems } from "@/components/auth/signup-view";
import { MIN_PASSWORD } from "@/components/auth-frame";

const read = (f: string) => readFileSync(f, "utf8");
const keys = (prefix: string) => (Object.keys(en) as (keyof typeof en)[]).filter((k) => k.startsWith(prefix));
const NEW_KEYS = [...keys("home2."), ...keys("auth.up.")];
const SOURCES = ["components/site/marketing/home-b.tsx", "components/site/marketing/home-b-client.tsx", "components/auth/signup-view.tsx", "lib/marketing-home.ts"];

describe("home page (Option B) and sign-up copy", () => {
  it("never states a fixed number of templates or layouts (EN, ES, components)", () => {
    const COUNT = /\b(one of|una de|uno de)\s+\d+|\b\d+\s+(templates?|layouts?|plantillas?|diseños?|dise[ñn]os)\b/i;
    for (const k of NEW_KEYS) {
      expect(en[k], k).not.toMatch(COUNT);
      expect(es[k], k).not.toMatch(COUNT);
    }
    for (const f of SOURCES) expect(read(f), f).not.toMatch(COUNT);
    // The approved evergreen wording is used.
    expect(en["home2.demoEyebrow"]).toBe("Professional menu templates");
    expect(en["home2.demoChipsLabel"]).toBe("Choose a template");
    expect(en["home2.how1Body"]).toMatch(/ready-made templates/);
    expect(en["auth.up.get1"]).toMatch(/Choose a template/);
  });

  it("the template caption is only the selected template's own name", () => {
    const client = read("components/site/marketing/home-b-client.tsx");
    expect(client).toContain('data-testid="hero-template-name">{name}</p>');
    expect(en["home2.realTemplate"]).toBe("Real Pekko template");
  });

  it("every new string is translated into Spanish with the same placeholders", () => {
    for (const k of NEW_KEYS) {
      expect(es[k], k).toBeTruthy();
      expect((es[k].match(/\{\w+\}/g) ?? []).sort(), k).toEqual((en[k].match(/\{\w+\}/g) ?? []).sort());
    }
    expect(NEW_KEYS.length).toBeGreaterThan(100);
  });

  it("trial, price and grace facts come from the product constants, not from copy", () => {
    expect(en["home2.trialLine"]).toContain("{days}");
    expect(en["home2.term1"]).toContain("{days}");
    expect(en["home2.term1"]).toContain("{screens}");
    expect(en["home2.term2"]).toContain("{grace}");
    expect(en["auth.up.chip1"]).toContain("{days}");
    const page = read("components/site/marketing/home-b.tsx");
    expect(page).toContain("TRIAL.days");
    expect(page).toContain("PLAYBACK_GRACE_DAYS");
    expect(page).toContain("<PricingCards"); // prices from lib/plans.ts
    for (const k of NEW_KEYS) expect(en[k], k).not.toMatch(/\$\d|\b14\b|\b5 screens\b/);
  });

  it("makes no unverifiable claims: no testimonials, ratings, customer counts or guarantees", () => {
    const BANNED = /testimonial|\breviews?\b|rated|\d+\+?\s*(customers|restaurants|businesses)|guarantee|#1|best[- ]in|trusted by|loved by|thousands|works on (every|all) tv/i;
    for (const k of NEW_KEYS) expect(`${en[k]} ${es[k]}`, k).not.toMatch(BANNED);
    // Smart TV claims stay qualified, as approved.
    expect(en["home2.tvFine"]).toMatch(/Tested on LG, Samsung, Vizio and Insignia/);
    expect(en["home2.tvFine"]).toMatch(/Some older TVs can’t open secure websites/);
    expect(en["home2.benefit1Body"]).toMatch(/On supported Smart TVs/);
  });

  it("shows genuine identity and support details, never the postal address", () => {
    const page = read("components/site/marketing/home-b.tsx");
    expect(page).toContain("LEGAL_COPYRIGHT");
    expect(page).toContain("SUPPORT_EMAIL");
    expect(page).not.toContain("LEGAL_ADDRESS");
    expect(read("components/auth/signup-view.tsx")).not.toContain("LEGAL_ADDRESS");
    expect(JSON.stringify([en, es].map((d) => NEW_KEYS.map((k) => d[k])))).not.toMatch(/Saticoy|Winnetka|91306/);
  });

  it("uses real templates, with both image sizes in public/", () => {
    for (const t of [...HERO_TEMPLATES, ...DEMO_TEMPLATES]) {
      expect(designById(t.id), t.id).not.toBeNull();
      expect(en[t.chip], t.chip).toBeTruthy();
    }
    for (const t of HERO_TEMPLATES) for (const w of [640, 1280] as const) expect(existsSync(`public${heroImage(t.id, w)}`), `${t.id}@${w}`).toBe(true);
    for (const f of ["gallery", "editor", "pair", "publish"]) expect(existsSync(`public/marketing/how/${f}.webp`), f).toBe(true);
  });

  it("keeps the previous home page as the rollback (HOME_VARIANT=classic)", () => {
    // The Peek marketing site is the default since its launch; HOME_VARIANT=b / classic still serve these pages
    // (see tests/unit/peek-marketing.test.ts).
    const prod = { VERCEL_ENV: "production" };
    expect(homeVariant({ ...prod, HOME_VARIANT: "b" })).toBe("b");
    expect(homeVariant({ ...prod, HOME_VARIANT: "Classic" })).toBe("classic");
    const page = read("app/page.tsx");
    expect(page).toContain('variant === "classic"');
    expect(page).toContain("<ClassicHome");
    expect(page).toContain("<HomeB");
    expect(page).toContain("SIGNED_IN_REDIRECT");
  });
});

describe("sign-up page: presentation only", () => {
  it("keeps the same Supabase calls, redirect and resend wait", () => {
    const src = read("app/login/page.tsx");
    expect(src).toContain("getSupabase().auth.signUp({ email, password, options: { emailRedirectTo: confirmRedirect() } })");
    expect(src).toContain('auth.resend({ type: "signup", email: pending, options: { emailRedirectTo: confirmRedirect() } })');
    expect(src).toContain("const RESEND_COOLDOWN_S = 60;");
    expect(src).toContain("safeDashboardNext");
    // Same field names, ids and autocomplete for password managers.
    const view = read("components/auth/signup-view.tsx");
    expect(view).toMatch(/id="login-email" name="email" type="email" autoComplete="email"/);
    expect(view).toMatch(/id="login-password" name="password" type=\{show \? "text" : "password"\} autoComplete="new-password"/);
    expect(view).toContain('htmlFor="login-email"');
    expect(view).toContain('htmlFor="login-password"');
  });

  it("checks the email shape and the password length before sending", () => {
    expect(signupProblems("rosa@kitchen.com", "longenough", MIN_PASSWORD)).toEqual([]);
    expect(signupProblems("rosa@kitchen", "taco", MIN_PASSWORD)).toEqual(["invalid_email", "short_password"]);
    expect(signupProblems(" rosa@kitchen.co ", "1234567", MIN_PASSWORD)).toEqual(["short_password"]);
    expect(en["auth.up.passwordHint"]).toContain("{min}");
  });
});

describe("funnel events", () => {
  it("accepts only allowed (event, detail) pairs", () => {
    expect(reduceFunnelEvent({ event: "cta_click", detail: "hero" })).toEqual({ event: "cta_click", detail: "hero" });
    expect(reduceFunnelEvent({ event: "signup_view" })).toEqual({ event: "signup_view", detail: "" });
    for (const bad of [null, "x", {}, { event: "cta_click" }, { event: "cta_click", detail: "footer" }, { event: "signup_view", detail: "hero" },
      { event: "signup_error", detail: "owner@example.com" }, { event: "signup_error", detail: 3 }, { event: "page_view" }]) {
      expect(reduceFunnelEvent(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("reduces Supabase error text to a code, never the text", () => {
    expect(signupErrorCode("Email rate limit exceeded")).toBe("rate_limit");
    expect(signupErrorCode("For security purposes, you can only request this after 30 seconds.")).toBe("rate_limit");
    expect(signupErrorCode("Failed to fetch")).toBe("network");
    expect(signupErrorCode("User already registered")).toBe("already_registered");
    expect(signupErrorCode("Password should be at least 8 characters.")).toBe("short_password");
    expect(signupErrorCode("Password is known to be weak and easy to guess")).toBe("weak_password");
    expect(signupErrorCode("Something odd for owner@example.com")).toBe("other");
    expect(signupErrorCode(null)).toBe("other");
  });

  it("builds stage rates and reports collecting=false without inventing counts", () => {
    const off = buildFunnel({ funnel: null, landings: 40, registrations: 3, confirmed: 2 });
    expect(off.collecting).toBe(false);
    expect(off.stages.map((s) => s.count)).toEqual([40, 0, 0, 0, 3, 2]);
    const on = buildFunnel({ funnel: { first_day: "2026-11-19", rows: [{ event: "cta_click", detail: "hero", count: 10 }, { event: "signup_view", detail: "", count: 8 }, { event: "signup_submit", detail: "", count: 4 }] }, landings: 40, registrations: 3, confirmed: 2 });
    expect(on.stages.map((s) => [s.key, s.count, s.fromPrevious])).toEqual([
      ["landings", 40, null], ["ctaClicks", 10, 0.25], ["signupViews", 8, 0.8], ["signupSubmits", 4, 0.5], ["registrations", 3, 0.75], ["confirmed", 2, 2 / 3],
    ]);
    expect(on.firstDay).toBe("2026-11-19");
  });

  it("is wired at every trial entry point on the new home page and in the sign-up form", () => {
    const page = read("components/site/marketing/home-b.tsx");
    for (const loc of ["hero", "demo", "final", "pricing"]) expect(page).toContain(`location="${loc}"`);
    expect(read("components/site/marketing/home-b-client.tsx")).toContain('location="sticky"');
    expect(read("components/site/site-nav.tsx")).toContain('trackFunnel("cta_click", "nav")');
    const login = read("app/login/page.tsx");
    for (const e of ["signup_view", "signup_submit", "signup_error"]) expect(login).toContain(`trackFunnel("${e}"`);
    // Never sends what the person typed.
    expect(login).not.toMatch(/trackFunnel\([^)]*(email|password)/);
  });
});
