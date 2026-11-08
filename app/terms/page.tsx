import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { LEGAL_ADDRESS, LEGAL_OPERATOR, LEGAL_OWNERSHIP, LEGAL_UPDATED, REFUND_POLICY, SUPPORT_EMAIL } from "@/lib/legal";
import { PLANS, TRIAL } from "@/lib/plans";
import { PAYMENT_GRACE_DAYS, PLAYBACK_GRACE_DAYS, TRANSITION_DAYS, TRIAL_DAYS } from "@/lib/server/entitlements";

export const metadata: Metadata = { title: "Terms of Service · Pekko" };

export default function Terms() {
  const prices = PLANS.map((plan) => `${plan.name} $${plan.price} for ${plan.screens} screen${plan.screens === 1 ? "" : "s"}`).join(", ");
  return (
    <LegalPage title="Terms of Service" updated={LEGAL_UPDATED}>
      <p>
        These terms cover your use of Pekko, a service for showing images, videos, and playlists on screens (&quot;the Service&quot;).
        The Service is provided by {LEGAL_OPERATOR} (&quot;we&quot;). {LEGAL_OWNERSHIP}
      </p>
      <p>Business address: {LEGAL_ADDRESS}.</p>
      <p>By creating an account you agree to these terms and the <a className="underline" href="/privacy">Privacy Policy</a>.</p>

      <h2 className="font-semibold text-lg">Accounts and content</h2>
      <p>Provide accurate account information and protect your sign-in credentials. You are responsible for the screens paired to your account and for content you upload. You retain ownership of your content and authorize Pekko to store, process, and deliver it to your screens to operate the Service. You confirm you have the rights to show it, and that it is not illegal, infringing, or harmful.</p>
      <p>Do not try to access another customer&apos;s account or content, interfere with the Service, overload it, or use it to distribute malware or unlawful material. We may limit or suspend an account that does.</p>

      <h2 className="font-semibold text-lg">Plans and trial</h2>
      <p>Monthly prices, in US dollars, are {prices}. Each new organization receives a {TRIAL_DAYS}-day trial from creation, with up to {TRIAL.screens} screens and no card required. After that trial, a separate {PLAYBACK_GRACE_DAYS}-day playback grace lets screens continue playing before they may pause if a paid plan has not been started. That playback grace does not extend the {TRIAL_DAYS}-day trial.</p>

      <h2 className="font-semibold text-lg" id="billing">Billing, cancellation, and existing customers</h2>
      <p>Stripe processes subscription payments, with {LEGAL_OPERATOR} as the seller, under standard Stripe Billing. Stripe is not the merchant of record. Pekko does not store card numbers. Payment receipts are sent by Stripe under its own customer-email settings. Pekko does not send a separate payment receipt. These terms do not enable Stripe Tax and do not set a tax rate. Publishing this page does not start a charge.</p>
      <p>Monthly subscriptions renew until canceled. Canceling stops the next renewal and keeps access through the period already paid. On a lower screen limit, the account owner chooses which screens remain active within the plan limit. The others pause. Pausing because a trial ended, a payment failed, a subscription was canceled, or a screen is over the plan limit does not delete media, playlists, schedules, or settings. That is separate from an owner-requested account deletion.</p>
      <p>Organizations that already existed before paid billing keep full access. They receive {TRANSITION_DAYS} days of continued full access after an advance billing notice is successfully sent. That countdown starts only when the notice email succeeds. It does not start when someone signs in, and publishing or reading this page is not that notice. Billing reminders and enforcement are separate switches and are not turned on by this page.</p>
      <p>A failed subscription payment receives {PAYMENT_GRACE_DAYS} days of playback grace from the first failed payment. A later failure in that same past-due period does not move the deadline. The dashboard shows the deadline to update payment details before playback may pause. Your content is not deleted.</p>

      <h2 className="font-semibold text-lg">Refunds</h2>
      <p>{REFUND_POLICY}</p>

      <h2 className="font-semibold text-lg">Ending your account</h2>
      <p>You can stop using the Service at any time. The account owner can request deletion from Settings or at <a className="underline" href="/account-deletion">/account-deletion</a>. Deletion runs 7 days after the request and can be canceled until then. We may suspend or close an account that breaks these terms.</p>

      <h2 className="font-semibold text-lg">Contact</h2>
      <p>
        <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a><br />
        {LEGAL_OPERATOR}<br />
        {LEGAL_ADDRESS}
      </p>
    </LegalPage>
  );
}
