import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAQ, FEATURES } from "@/lib/marketing";
import { PLANS, TRIAL } from "@/lib/plans";
import { SIGNUP_HREF } from "@/components/site/sections";
import { en } from "@/lib/i18n/en";

// I18N-1: page copy lives in lib/i18n/en.ts (es.ts mirrors it); pages render it through t().
const dict = Object.values(en).join("\n");

const home = readFileSync("app/page.tsx", "utf8");
const features = readFileSync("app/features/page.tsx", "utf8");
const pricing = readFileSync("app/pricing/page.tsx", "utf8");
const signup = readFileSync("app/signup/page.tsx", "utf8");

describe("presentation site copy", () => {
  it("uses the approved sentences and leaves trial signup in place", () => {
    expect(en["home.title"]).toBe("Menus, offers, and presentations on your screens.");
    expect(home).toContain('t("home.title")');
    expect(en["home.lede"]).toBe("Show restaurant specials, business promotions, and team updates. Bring images, videos, and presentations together in playlists, and manage your screens from your phone or computer.");
    expect(home).toContain('data-testid="start-trial"');
    expect(home).toContain("<TrialNote");
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
    expect(en["home.step3Title"]).toBe("Add your content");
    expect(en["home.step3Body"]).toBe("Upload images, videos, or a presentation, arrange your playlist, and publish it to your connected screens.");
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
