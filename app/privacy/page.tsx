import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { LEGAL_ADDRESS, LEGAL_OPERATOR, LEGAL_OWNERSHIP, LEGAL_PRIVACY_UPDATED, SUPPORT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy · Pekko" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated={LEGAL_PRIVACY_UPDATED} dateLine={`Effective ${LEGAL_PRIVACY_UPDATED}. Last updated ${LEGAL_PRIVACY_UPDATED}.`}>
      <p>This policy explains what {LEGAL_OPERATOR} processes when you use Pekko, why, and the choices the product actually offers. {LEGAL_OWNERSHIP}</p>

      <h2 className="font-semibold text-lg" id="changes">Changes to this policy</h2>
      <p>
        Before a material change takes effect, the updated policy is posted on this page with its new effective date. The page stays linked from the site footer.
        When notice is required, or when notice is appropriate for an account whose email address Pekko has, that notice is sent to the account email.
        Pekko does not automatically email every edit of this page. Publishing this section does not send an email.
      </p>

      <h2 className="font-semibold text-lg">Information used to operate Pekko</h2>
      <ul className="list-disc pl-5 grid gap-1">
        <li><strong>Account.</strong> Email address, business name, and an optional display name. Sign-in passwords are stored by Supabase Auth, not as plain text in Pekko&apos;s account rows.</li>
        <li><strong>Content and setup.</strong> Images, videos, menu boards, and brand settings you upload, plus playlists, schedules, promotions, locations, screen groups, and screen names.</li>
        <li><strong>Screens.</strong> For each paired screen: when it last checked in, what it reported playing, playback errors, offline periods, and a device token stored only as a hash. Nothing is collected about people walking past a screen.</li>
        <li><strong>First-party activity.</strong> Records of publishes, screen-content changes, pairing and removal, schedule changes, and uploads or deletions. Also hourly screen uptime and confirmed playback. Product milestones for the account record trial started, first screen paired, first publish, plan change, cancellation, how many screens were paired during the trial, and trial expired. Those milestone rows are not shown in your activity list.</li>
        <li><strong>Plan and billing.</strong> Plan, trial dates, subscription status, the current paid period, and Stripe customer and subscription identifiers when a paid subscription exists. Pekko does not store card numbers.</li>
        <li><strong>Mobile push.</strong> If you use the Pekko app and the device allows notifications, a push token for that device.</li>
        <li><strong>Abuse limits and logs.</strong> Pairing attempts are limited using the request IP address as the rate-limit key. That key can remain in the rate-limit table; this application does not set a separate destruction date for it. Vercel error logs written by this app include the method, path, and a short message. They do not include headers, cookies, or request bodies.</li>
      </ul>

      <h2 className="font-semibold text-lg">Why it is used</h2>
      <p>To sign you in, store and deliver your content to your screens, show screen status, send account and screen alerts, run billing when a paid plan is started, measure which ads and channels bring new sign-ups, limit abuse, and troubleshoot the Service. You keep ownership of your content. We do not sell personal information. There is no sale to opt out of, and this policy is not a claim of compliance with any particular privacy statute.</p>

      <h2 className="font-semibold text-lg">What is measured, and what is not</h2>
      <p>The records above are first-party records of the account&apos;s own screens and changes. This application does not include an advertising network or a third-party website-analytics script. The dashboard sign-in client stores the session in the browser and calls Pekko&apos;s API with a bearer token.</p>
      <p>Transactional email goes through Resend as plain text. The send request does not turn on open or click tracking, and the verified pekkotv.com sending domain reports open and click tracking off. That describes this application and that domain setting. It is not a promise that a provider never logs or measures its own systems.</p>

      <h2 className="font-semibold text-lg">Ad and campaign attribution</h2>
      <p>
        When you first arrive at pekkotv.com, we may save campaign tags from the link (source, medium, campaign, content and term) and the address of the site that sent you (the referrer) in a first-party cookie and your browser&apos;s local storage for up to 90 days.
        If you create an account in that time, we copy this first-visit information to your account once, at sign-up, and we do not overwrite it later.
        We use it only to measure which ads and channels bring new sign-ups. We don&apos;t sell it or share it with advertisers or ad networks, and we don&apos;t use advertising pixels or third-party analytics scripts.
        The copy on your account is deleted when your account is deleted.
      </p>

      <h2 className="font-semibold text-lg">Service providers</h2>
      <ul className="list-disc pl-5 grid gap-1">
        <li><strong>Supabase</strong> provides the database, authentication, and file storage. The Pekko project reports region us-west-1. That is the project region, not a promise that every backup, log, or support access stays there.</li>
        <li><strong>Vercel</strong> hosts the website and API.</li>
        <li><strong>Stripe</strong> processes paid subscriptions when a paid plan is started, under standard Stripe Billing. Pekko is the seller. Publishing this policy does not enable charges.</li>
        <li><strong>Resend</strong> sends transactional service and billing email. The verified pekkotv.com sending domain reports region us-east-1. That is the sending region, not a promise that every Resend system stays there. The support address below receives mail on that domain. Use that address, not the billing sender, for privacy and support.</li>
        <li><strong>Google Firebase Cloud Messaging</strong> delivers mobile push notifications when a device token is registered and the device allows notifications.</li>
      </ul>
      <p>No exclusive residency or cross-border-transfer assurance is made. A reported project or sending region is not a guarantee that all processing stays in that region.</p>

      <h2 className="font-semibold text-lg">How long it is kept</h2>
      <p>Account and content information is kept while the account is open, and longer where a provider backup or a legal need retains it. This application does not set Supabase&apos;s backup cycle or Stripe&apos;s billing-record period, so it does not state a number of days for either. Screen uptime, playback events, offline periods, activity records, and screen alerts are removed after 90 days. Trial expiry, a failed payment, or cancellation does not by itself delete content.</p>
      <p>The account owner can update the display name, business name, and password in Settings, and can request account deletion in Settings or at <a className="underline" href="/account-deletion">/account-deletion</a>. Deletion runs 7 days after the request and can be canceled until then. It removes the account, sign-in, content, and the records listed on that page. A deletion record of the account id, user id, and request dates is kept, without the email address or the content. Do not read the screen-preservation rule as a promise that provider backups or legally required billing records disappear immediately.</p>

      <h2 className="font-semibold text-lg">Choices</h2>
      <ul className="list-disc pl-5 grid gap-1">
        <li>Update the display name, business name, and password in Settings. The account email is shown there.</li>
        <li>Allow or refuse mobile notifications on the device. A push token is stored only when notifications are used.</li>
        <li>Cancel a subscription from the billing portal Stripe provides after a paid plan exists. Cancellation stops the next renewal.</li>
        <li>Choose which screens stay active when a plan includes fewer screens. The others pause. Content is kept.</li>
        <li>Request deletion, or cancel a pending deletion, as described above.</li>
        <li>Email the contact below for a privacy request about your account. We may need to confirm that you control the account before acting on it.</li>
      </ul>

      <h2 className="font-semibold text-lg">Children</h2>
      <p>Pekko is for businesses and is not directed to children under 13.</p>

      <h2 className="font-semibold text-lg">Contact</h2>
      <p>
        <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a><br />
        {LEGAL_OPERATOR}<br />
        {LEGAL_ADDRESS}
      </p>
    </LegalPage>
  );
}
