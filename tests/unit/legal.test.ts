import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAYMENT_GRACE_DAYS, PLAYBACK_GRACE_DAYS, TRANSITION_DAYS, TRIAL_DAYS } from "@/lib/server/entitlements";
import { PLANS, TRIAL } from "@/lib/plans";
import {
  LEGAL_ADDRESS, LEGAL_OPERATOR, LEGAL_PRIVACY_UPDATED, LEGAL_UPDATED, REFUND_POLICY, SUPPORT_EMAIL,
} from "@/lib/legal";

const PAGES = [
  "app/terms/page.tsx",
  "app/privacy/page.tsx",
  "app/account-deletion/page.tsx",
  "components/contact-block.tsx",
  "components/billing-disclosure.tsx",
  "components/site/site-footer.tsx",
  "app/login/page.tsx",
];

describe("published legal pages", () => {
  it("uses the authorized operator, address, mailbox, and refund policy", () => {
    expect(LEGAL_OPERATOR).toBe("Francisco Lopez, a sole proprietor doing business as Pekko");
    expect(LEGAL_UPDATED).toBe("November 8, 2026");
    expect(LEGAL_PRIVACY_UPDATED).toBe("November 12, 2026");
    expect(LEGAL_ADDRESS).toBe("20227 Saticoy St, Apt 202, Winnetka, CA 91306, US");
    expect(SUPPORT_EMAIL).toBe("vivalopez06-wh5rwz@mail.grokbot.com");
    expect(REFUND_POLICY).toMatch(/not refunded for unused time/);
    expect(REFUND_POLICY).toMatch(/required by applicable law/);
    expect(REFUND_POLICY).toMatch(/duplicate or incorrect charges/);
    expect(TRIAL_DAYS).toBe(14);
    expect(TRIAL.days).toBe(14);
    expect(TRIAL.screens).toBe(5);
    expect(PLAYBACK_GRACE_DAYS).toBe(3);
    expect(TRANSITION_DAYS).toBe(14);
    expect(PAYMENT_GRACE_DAYS).toBe(7);
    expect(PLANS.map((plan) => [plan.price, plan.screens])).toEqual([[19, 1], [39, 3], [59, 5]]);
  });

  it("publishes those facts and does not leave placeholders or a lawyer-review claim", () => {
    const terms = readFileSync("app/terms/page.tsx", "utf8");
    const privacy = readFileSync("app/privacy/page.tsx", "utf8");
    const joined = PAGES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(terms).toContain("LEGAL_ADDRESS");
    expect(terms).toContain("REFUND_POLICY");
    expect(terms).toContain("TRIAL_DAYS");
    expect(terms).toContain("PLAYBACK_GRACE_DAYS");
    expect(terms).toContain("TRANSITION_DAYS");
    expect(terms).toContain("PAYMENT_GRACE_DAYS");
    expect(terms).toContain('id="billing"');
    expect(terms).toMatch(/publishing or reading this page is not that notice/i);
    expect(privacy).toContain("us-west-1");
    expect(privacy).toContain("us-east-1");
    expect(privacy).toContain("Supabase");
    expect(privacy).toContain("Vercel");
    expect(privacy).toContain("Stripe");
    expect(privacy).toContain("Resend");
    expect(privacy).toContain("90 days");
    expect(privacy).toContain("LEGAL_PRIVACY_UPDATED");
    expect(privacy).not.toMatch(/\bLEGAL_UPDATED\b/);
    expect(terms).toContain("LEGAL_UPDATED");
    expect(terms).not.toContain("LEGAL_PRIVACY_UPDATED");
    expect(privacy).toMatch(/Ad and campaign attribution/);
    expect(privacy).toMatch(/first-party cookie and your browser/);
    expect(privacy).toMatch(/we do not overwrite it later/);
    expect(privacy).toMatch(/The copy on your account is deleted when your account is deleted/);
    expect(privacy).toMatch(/we don&apos;t use advertising pixels or third-party analytics scripts/);
    expect(privacy).toMatch(/measure which ads and channels bring new sign-ups/);
    expect(privacy).toMatch(/does not include an advertising network or a third-party website-analytics script/);
    expect(privacy).toMatch(/not a promise that every backup/);
    expect(privacy).toMatch(/not a guarantee that all processing stays/);
    expect(privacy).toMatch(/not a claim of compliance/);
    expect(privacy).toContain('id="changes"');
    expect(privacy).toContain("dateLine={`Effective ${LEGAL_PRIVACY_UPDATED}. Last updated ${LEGAL_PRIVACY_UPDATED}.`}");
    expect(privacy).toMatch(/Before a material change takes effect, the updated policy is posted on this page/);
    expect(privacy).toMatch(/linked from the site footer/);
    expect(privacy).toMatch(/sent to the account email/);
    expect(privacy).toMatch(/does not automatically email every edit/);
    expect(privacy).not.toMatch(/sendTransactionalEmail|emailProvider\(/);
    expect(privacy).not.toMatch(/CCPA|GDPR/);
    for (const file of PAGES) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/to be confirmed|UNPUBLISHED DRAFT|\[Business address|\[Support email|\[Legal entity/);
      expect(text, file).not.toMatch(/reviewed by a lawyer/i);
      expect(text, file).not.toMatch(/processing stays only in|exclusively in/i);
    }
    expect(joined).not.toContain("docs/legal");
    expect(readFileSync("components/site/site-footer.tsx", "utf8")).toContain('"/terms#billing"');
    expect(readFileSync("app/login/page.tsx", "utf8")).toContain('data-testid="signup-legal"');
    expect(readFileSync("app/dashboard/billing/page.tsx", "utf8")).toContain("<BillingDisclosure");
    expect(readFileSync("components/site/sections.tsx", "utf8")).toContain("<BillingDisclosure");
    expect(readFileSync("lib/legal.ts", "utf8")).not.toMatch(/STRIPE_LIVE_ENABLED|BILLING_ENFORCE|BILLING_REMINDERS|process\.env/);
  });
});
