import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAQ, FEATURES } from "@/lib/marketing";
import { PLANS, TRIAL } from "@/lib/plans";
import { SIGNUP_HREF } from "@/components/site/sections";

const home = readFileSync("app/page.tsx", "utf8");
const features = readFileSync("app/features/page.tsx", "utf8");
const pricing = readFileSync("app/pricing/page.tsx", "utf8");
const signup = readFileSync("app/signup/page.tsx", "utf8");

describe("presentation site copy", () => {
  it("uses the approved sentences and leaves trial signup in place", () => {
    expect(home).toContain("Menus, offers, and presentations on your screens.");
    expect(home).toContain("Show restaurant specials, business promotions, and team updates. Bring images, videos, and presentations together in playlists, and manage your screens from your phone or computer.");
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
    expect(features).toContain(feature?.title);
    expect(features).toContain(feature?.body);
    expect(home).toContain("Add your content");
    expect(home).toContain("Upload images, videos, or a presentation, arrange your playlist, and publish it to your connected screens.");
  });

  it("states only the verified upload limits and does not claim slide editing", () => {
    const answer = FAQ.find((item) => item.q === "Can I upload PowerPoint presentations or PDFs?")?.a ?? "";
    expect(answer).toBe("Yes. Upload a .pptx or PDF file, up to 50 MB and 40 slides or pages. Pekko converts slides and pages into still images for your playlists. Animations, transitions, and embedded videos won't play. Older .ppt and macro-enabled .pptm files aren't supported.");
    const published = [home, features, readFileSync("lib/marketing.ts", "utf8")].join("\n");
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
    expect(home).not.toMatch(/STRIPE_LIVE_ENABLED|BILLING_ENFORCE|BILLING_REMINDERS/);
  });
});
