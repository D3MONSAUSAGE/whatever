import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAQ, FEATURES } from "@/lib/marketing";
import { PLANS, TRIAL } from "@/lib/plans";
import { SIGNUP_HREF } from "@/components/site/sections";
import { en } from "@/lib/i18n/en";

// I18N-1: page copy lives in lib/i18n/en.ts (es.ts mirrors it); pages render it through t().
const dict = Object.values(en).join("\n");

// The previous home page (kept as the HOME_VARIANT=classic rollback) is home-classic.tsx plus its section components.
// The Option B home page has its own checks in tests/unit/home-b.test.ts.
const home = [readFileSync("app/page.tsx", "utf8"), readFileSync("components/site/marketing/home-classic.tsx", "utf8"), readFileSync("components/site/marketing/showcase.tsx", "utf8")].join("\n");
const features = readFileSync("app/features/page.tsx", "utf8");
const pricing = readFileSync("app/pricing/page.tsx", "utf8");
const signup = readFileSync("app/signup/page.tsx", "utf8");

describe("presentation site copy", () => {
  it("uses the approved sentences and leaves trial signup in place", () => {
    // Marketing redesign: hero copy follows the approved landing-page prototype.
    expect(en["home.title"]).toBe("Your menu and promotions, on the TV you already have.");
    expect(home).toContain('t("home.title")');
    expect(en["home.lede"]).toBe("Pekko turns a compatible smart TV’s web browser into digital signage, with no separate hardware box. Build a branded menu or upload your own artwork, then publish from your phone.");
    expect(home).toContain('data-testid="start-trial"');
    expect(home).toContain('t("mk.hero.check2")');
    expect(en["mk.hero.check2"]).toBe("No credit card");
    expect(SIGNUP_HREF).toBe("/signup");
    expect(signup).toContain('redirect("/login?mode=up")');

    const feature = FEATURES.find((item) => item.id === "media");
    expect(feature).toEqual({
      id: "media",
      title: "Turn presentations into screen content",
      body: "Upload a PowerPoint (.pptx) or PDF to share menus, promotions, or office announcements. Pekko converts each slide or page into a still image you can use in your playlists.",
    });
    expect(en["features.row2Title"]).toBe(feature?.title);
    expect(en["features.row2Body"]).toBe(feature?.body);
    expect(features).toContain("features.row${r.n}Title");
    expect(en["home.step3Title"]).toBe("Upload and publish");
    expect(en["home.step3Body"]).toBe("Add your menu, artwork, images or videos, arrange a playlist, and publish it to the screen.");
  });

  it("states only the verified upload limits and does not claim slide editing", () => {
    const answer = FAQ.find((item) => item.q === "Can I upload PowerPoint presentations or PDFs?")?.a ?? "";
    expect(answer).toBe("Yes. Upload a .pptx or PDF file, up to 50 MB and 40 slides or pages. Pekko converts slides and pages into still images for your playlists. Animations, transitions, and embedded videos won't play. Older .ppt and macro-enabled .pptm files aren't supported.");
    const published = [home, features, readFileSync("lib/marketing.ts", "utf8"), dict].join("\n");
    expect(published).not.toMatch(/reorder its slides|edit their content|replace the uploaded file/i);
    expect(published).not.toMatch(/animations are preserved|native PowerPoint|slide editor|all formats/i);
  });

  it("does not change plans, trial length, or the pricing page", () => {
    expect(TRIAL).toEqual({ days: 14, screens: 5 });
    expect(PLANS.map((plan) => [plan.id, plan.price, plan.screens])).toEqual([
      ["starter", 19, 1],
      ["business", 39, 3],
      ["multi", 59, 5],
    ]);
    expect(FAQ.find((item) => item.q === "Which plans are there?")?.a).toContain("$19");
    expect(FAQ.find((item) => item.q === "Which plans are there?")?.a).toContain("$39");
    expect(FAQ.find((item) => item.q === "Which plans are there?")?.a).toContain("$59");
    expect(FAQ.find((item) => item.q === "How does the free trial work?")?.a).toContain("14-day");
    expect(FAQ.find((item) => item.q === "What happens when the trial ends?")?.a).toContain("3 more days");
    expect(pricing).toContain("PricingCards");
    expect(pricing).toContain("TrialDetails");
    expect(pricing).not.toContain("Turn presentations into screen content");
    expect(pricing).not.toContain("features.row2");
    expect(home).not.toMatch(/STRIPE_LIVE_ENABLED|BILLING_ENFORCE|BILLING_REMINDERS/);
  });
});

describe("launch site copy", () => {
  const support = readFileSync("app/support/page.tsx", "utf8");
  const sections = readFileSync("components/site/sections.tsx", "utf8");
  const marketing = readFileSync("lib/marketing.ts", "utf8");
  const publicCopy = [home, features, pricing, support, sections, marketing, dict, readFileSync("lib/i18n/es.ts", "utf8")].join("\n");

  it("does not claim offline playback on public marketing pages", () => {
    expect(publicCopy).not.toMatch(/offline playback/i);
    expect(publicCopy).not.toMatch(/Keeps playing offline/);
    expect(publicCopy).not.toMatch(/keeps playing saved content/i);
    expect(publicCopy).not.toMatch(/keeps showing (content|saved)/i);
    expect(publicCopy).not.toMatch(/if the internet drops/i);
    expect(marketing).not.toContain('id: "offline"');
    expect(en["site.planFeature3"]).toBe("✓ Screen status and alerts");
    expect(sections).toContain('t("site.planFeature3")');
    expect(FAQ.find((item) => item.q === "What if the internet goes down?")?.a).toBe(
      "Your dashboard shows the screen as offline. Check the TV's Wi-Fi, power, and that the Pekko player is still open.",
    );
  });

  it("points the TV at pekkotv.com/pair and matches the 10-minute code refresh", () => {
    expect(en["support.address.a"]).toContain("pekkotv.com/pair");
    expect(publicCopy).not.toMatch(/yourpekko\.site/);
    expect(en["support.code.a"]).toContain("A new code appears every 10 minutes.");
    expect(en["support.code.a"]).not.toMatch(/after a few minutes/);
    expect(support).toContain("support.${f.id}.a");
    expect(readFileSync("public/player.html", "utf8")).toContain("A new code appears every 10 minutes.");
  });

  it("uses the tested-brands device wording and does not say any modern browser", () => {
    const device = "Runs in your smart TV's web browser, tested on major brands including LG, Samsung, Vizio and Insignia.";
    expect(en["home.featuresIntro"]).toBe(device);
    expect(en["features.lede"]).toContain("tested on major brands including LG, Samsung, Vizio and Insignia");
    expect(FAQ.find((item) => item.q === "What devices does Pekko work on?")?.a).toContain(
      "tested on major brands including LG, Samsung, Vizio and Insignia",
    );
    expect(publicCopy).not.toMatch(/any device with a modern web browser/i);
    expect(publicCopy).not.toMatch(/anything with a web browser/i);
    expect(publicCopy).not.toMatch(/turns any screen with a web browser/i);
  });
});

describe("marketing redesign: honest samples and safe scope", () => {
  const showcase = readFileSync("components/site/marketing/showcase.tsx", "utf8");
  const boards = readFileSync("components/site/marketing/boards.tsx", "utf8");
  const samples = readFileSync("lib/marketing-samples.ts", "utf8");
  const featuresPage = readFileSync("app/features/page.tsx", "utf8");
  const es = readFileSync("lib/i18n/es.ts", "utf8");
  const mk = Object.entries(en).filter(([k]) => k.startsWith("mk.")).map(([, v]) => v).join("\n");

  it("labels every sample board as a sample and says the businesses are fictional", () => {
    expect(en["mk.sample"]).toBe("Sample design");
    expect(en["mk.samplesNote"]).toMatch(/fictional/);
    // Each TV visual on the home and features pages sits next to a sample note or label.
    expect((showcase.match(/<Tv /g) ?? []).length).toBeGreaterThan(0);
    expect(showcase).toContain('t("mk.sample")');
    expect(showcase).toContain('t("mk.samplesNote")');
    expect(featuresPage).toContain('t("mk.samplesNote")');
    for (const key of Object.keys(en).filter((k) => k.startsWith("mk.tv.") && k !== "mk.tv.pair")) {
      expect(en[key as keyof typeof en], key).toMatch(/^Sample (design|artwork):/);
    }
  });

  it("never presents the fictional businesses as customers", () => {
    const copy = [mk, showcase, boards, samples].join("\n");
    expect(copy).not.toMatch(/testimonial|trusted by|our customers|customers like|used by|loved by|case study/i);
  });

  it("does not claim universal TV compatibility or offline video", () => {
    const copy = [mk, en["home.title"], en["home.lede"], en["home.step1Body"], en["faq.compat.a"], en["faq.connect.a"]].join("\n");
    // "Not every TV is compatible" is the honest disclaimer itself; everything else must not promise universal support.
    expect(copy.replace(/Not every TV is compatible\./g, "")).not.toMatch(/any (smart )?tv|every tv|all tvs|works on any|any screen/i);
    expect(copy).not.toMatch(/offline (playback|video)/i);
    expect(en["home.lede"]).toMatch(/compatible smart TV/);
    expect(en["mk.feat.hardwareBody"]).toMatch(/compatible smart TV/);
    expect(en["faq.compat.a"]).toMatch(/^Not every TV is compatible\./);
  });

  it("describes video in the media panel as muted MP4 with a still-image fallback", () => {
    expect(en["mk.video.body"]).toMatch(/muted video/);
    expect(en["mk.video.p1"]).toBe("MP4 (H.264) video, played muted");
    expect(en["mk.video.p3"]).toMatch(/still image/);
  });

  it("keeps Spanish complete for the new copy", () => {
    for (const key of Object.keys(en).filter((k) => k.startsWith("mk.") || k.startsWith("faq.compat") || k.startsWith("faq.connect"))) {
      expect(es, key).toContain(`"${key}":`);
    }
  });

  it("applies the dark theme only to the marketing pages", () => {
    for (const p of ["app/page.tsx", "app/features/page.tsx", "app/pricing/page.tsx", "app/faq/page.tsx", "app/support/page.tsx", "app/contact/page.tsx"]) {
      expect(readFileSync(p, "utf8"), p).toContain('theme="dark"');
    }
    for (const p of ["components/legal-page.tsx", "app/account-deletion/page.tsx", "app/not-found.tsx"]) {
      expect(readFileSync(p, "utf8"), p).not.toContain('theme="dark"');
    }
    const css = readFileSync("components/site/marketing/marketing.css", "utf8");
    // Every selector in the marketing stylesheet is scoped under .mk (or is a .mk-/.bd- class only those pages render).
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@font-face\s*\{[^}]*\}/g, "").replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "")
      .replace(/@media[^{]+\{/g, "").match(/[^{}]+(?=\{)/g) ?? [];
    for (const sel of selectors.map((s) => s.trim()).filter(Boolean)) {
      for (const part of sel.split(",").map((s) => s.trim())) expect(part, part).toMatch(/^\.(mk|bd)\b|^\.(mk|bd)-/);
    }
  });
});
