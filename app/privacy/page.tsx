import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { PrivacyEs } from "@/components/legal/privacy-es";
import { showSpanishLegal, type LegalParams } from "@/lib/legal-locale";
import { LEGAL_ADDRESS, LEGAL_OPERATOR, LEGAL_OWNERSHIP, LEGAL_PRIVACY_UPDATED, SUPPORT_EMAIL } from "@/lib/legal";

export async function generateMetadata({ searchParams }: { searchParams: LegalParams }): Promise<Metadata> {
  return { title: (await showSpanishLegal(searchParams)) ? "Política de privacidad · Pekko" : "Privacy Policy · Pekko" };
}

export default async function Privacy({ searchParams }: { searchParams: LegalParams }) {
  if (await showSpanishLegal(searchParams)) return <PrivacyEs />;
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
        <li><strong>Account.</strong> Email address, business name, an optional display name, and when the account was created and last signed in. Sign-in passwords are stored by Supabase Auth, not as plain text in Pekko&apos;s account rows.</li>
        <li><strong>Content and setup.</strong> Images, videos, menu boards, and brand settings you upload, plus playlists, schedules, promotions, locations, screen groups, and screen names.</li>
        <li><strong>Screens.</strong> For each paired screen: when it last checked in, what it reported playing, playback errors, offline periods, and a device token stored only as a hash. Nothing is collected about people walking past a screen.</li>
        <li><strong>First-party activity.</strong> Records of publishes, screen-content changes, pairing and removal, schedule changes, and uploads or deletions. Also hourly screen uptime and confirmed playback. Product milestones for the account record trial started, first screen paired, first publish, plan change, cancellation, how many screens were paired during the trial, and trial expired. Those milestone rows are not shown in your activity list.</li>
        <li><strong>Plan and billing.</strong> Plan, trial dates, subscription status, the current paid period, and Stripe customer and subscription identifiers when a paid subscription exists. Pekko does not store card numbers.</li>
        <li><strong>Mobile push.</strong> If you use the Pekko app and the device allows notifications, a push token for that device. To deliver notifications, Google&apos;s Firebase software in the app also creates a Firebase installation ID on the device and shares it with Google; Pekko does not store or use that ID.</li>
        <li><strong>Abuse limits and logs.</strong> Pairing attempts are limited using the request IP address as the rate-limit key. That key can remain in the rate-limit table; this application does not set a separate destruction date for it. Vercel error logs written by this app include the method, path, and a short message. They do not include headers, cookies, or request bodies.</li>
      </ul>

      <h2 className="font-semibold text-lg">Why it is used</h2>
      <p>To sign you in, store and deliver your content to your screens, show screen status, send account and screen alerts, run billing when a paid plan is started, measure which ads and channels bring new sign-ups, count visits to the public website, produce internal statistics about how the Service is used, support customers, limit abuse, and troubleshoot the Service. You keep ownership of your content. We do not sell personal information. There is no sale to opt out of, and this policy is not a claim of compliance with any particular privacy statute.</p>

      <h2 className="font-semibold text-lg" id="staff-access">Who at Pekko can see your account details</h2>
      <p>
        A small number of authorized Pekko staff can see account and usage details on a private internal page, to support customers and run the Service.
        That page shows the account email and whether it is confirmed, the sign-up date, plan, trial and subscription status, whether screens are paired and have shown content, screen counts and the last check-in time, the date and type of the latest activity (including the last sign-in), whether the account is marked as internal or test, whether the account is marked for deletion, and the first-visit campaign source described below.
        It does not show passwords, payment card details, your uploaded content, playlists, menus, or messages.
        It reads the current account records, so a deleted account no longer appears there.
      </p>

      <h2 className="font-semibold text-lg">What is measured, and what is not</h2>
      <p>The records above are first-party records of the account&apos;s own screens and changes. This application does not include an advertising network. It uses two kinds of website analytics: Pekko&apos;s own cookieless visit counter and a third-party product-analytics service, HeyCatch, both described below. The dashboard sign-in client stores the session in the browser and calls Pekko&apos;s API with a bearer token.</p>
      <p>Transactional email goes through Resend as plain text. The send request does not turn on open or click tracking, and the verified pekkotv.com sending domain reports open and click tracking off. That describes this application and that domain setting. It is not a promise that a provider never logs or measures its own systems.</p>

      <h2 className="font-semibold text-lg">Ad and campaign attribution</h2>
      <p>
        When you first arrive at pekkotv.com, we may save campaign tags from the link (source, medium, campaign, content and term) and the address of the site that sent you (the referrer) in a first-party cookie and your browser&apos;s local storage for up to 90 days.
        If you create an account in that time, we copy this first-visit information to your account once, at sign-up, and we do not overwrite it later.
        We use it only to measure which ads and channels bring new sign-ups, and authorized Pekko staff can see an account&apos;s first-visit source on the internal page described above. We don&apos;t sell it or share it with advertisers or ad networks, and we don&apos;t use advertising pixels. We do use one third-party analytics service, HeyCatch, described below.
        The copy on your account is deleted when your account is deleted.
      </p>

      <h2 className="font-semibold text-lg" id="product-analytics">Product analytics (HeyCatch)</h2>
      <p>Pekko uses HeyCatch (<a className="underline" href="https://heycatch.ai">heycatch.ai</a>) to understand how visitors find pekkotv.com, which buttons they use, and whether they finish creating an account. Pekko decides what is collected and why, and HeyCatch acts as our service provider (processor).</p>
      <p><strong>What is stored on your device.</strong> When you open pekkotv.com, HeyCatch&apos;s code sets a first-party cookie named ph_phc_…_posthog on pekkotv.com that lasts up to 365 days. It holds a random device ID and visitor ID that recognize your browser on later visits, and it keeps a copy of the same information in your browser&apos;s local storage and, for the open tab, session storage (including a random session ID).</p>
      <p><strong>What is sent.</strong> With each page view, and with clicks on the public pages (home, features, pricing, FAQ, support, contact; English and Spanish), your browser sends HeyCatch: the page address (without any part after a #, and without sign-in or confirmation links&apos; details), the site that sent you, campaign tags in the link, the page title on public pages, the text and type of the button or link you clicked on public pages, your browser, operating system, device type, language, time zone, screen size and user agent. HeyCatch&apos;s servers also receive your IP address with the request and may derive an approximate location. On the sign-in, sign-up and dashboard pages only page views are sent.</p>
      <p><strong>Account creation.</strong> When a new account is created we send one &quot;signup completed&quot; event and link it to the visit that led to it, using a random account ID. This lets us see how many people who click &quot;Create my free menu&quot; finish signing up. After you sign in, later page views are tied to that random account ID.</p>
      <p><strong>What is never sent.</strong> Your email address, your name, your business name, menu or screen content, passwords, sign-in or confirmation tokens, and anything you type into a form. Staff and developer pages, the TV player and pairing pages send nothing.</p>
      <p><strong>Your choice.</strong> If your browser sends Do Not Track or Global Privacy Control, the HeyCatch code does not start: it sets no cookie and sends nothing. There is no cookie banner; this signal is the way to opt out on pekkotv.com. You can also block or delete the ph_phc_… cookie and storage in your browser settings; the next visit may create a new one. HeyCatch states that it does not itself respond to those signals, which is why we apply them before anything is sent.</p>
      <p><strong>Who sees it and how long.</strong> The data is held by HeyCatch, which hosts product analytics on PostHog&apos;s US cloud and uses other infrastructure providers listed in its privacy policy (<a className="underline" href="https://heycatch.ai/privacy">heycatch.ai/privacy</a>). HeyCatch keeps this data while Pekko&apos;s subscription is active and for two months after it ends, and keeps server logs for up to 13 months. We do not sell this data or use it for advertising.</p>

      <h2 className="font-semibold text-lg" id="website-statistics">Website visit statistics</h2>
      <p>
        On the public pages of pekkotv.com (the home, features, pricing, FAQ, support and contact pages, in English and Spanish), Pekko counts visits with its own first-party counter. It sets no cookie and stores no IP address, browser fingerprint or persistent identifier.
        When one of these pages loads, your browser sends Pekko the page address without its query string. For the first page of a visit it also sends the address of the site that sent you, of which only the site name is kept, and any campaign tags in the link (source, medium and campaign).
        To count unique visitors, Pekko&apos;s server combines your IP address and your browser&apos;s user-agent string with a random value that changes every day, and turns them into a one-way code. The IP address and user-agent string are not saved.
        That code is kept only for the day it is made and is then replaced by a daily total. Each daily random value is deleted after two days, so visits can&apos;t be linked across days or traced back to you.
        What is kept is daily totals per page and traffic source, which authorized Pekko staff see on the internal page described above. These totals are deleted after 400 days.
        A per-tab flag in your browser&apos;s session storage, which is never sent to Pekko, tells the first page of a visit apart from later pages.
        Visits are not counted while you are signed in to Pekko, or when your browser sends a Global Privacy Control or Do Not Track signal. Dashboards, sign-in pages, the TV player and these legal pages are not counted as visits.
        The same counter also keeps daily totals of a few steps toward starting a trial: clicks on a trial button (and where on the page it was), template previews used on the home page, views and submissions of the sign-up form, and the type of sign-up problem (for example, a password that is too short). Only the step and a daily count are kept. Your email address, what you type and any identifier are never sent with these steps.
        These statistics are not linked to any account and are not shared with advertisers or ad networks.
        This counter is separate from HeyCatch. Where the counter says it sets no cookie and keeps no persistent identifier, that applies to the counter only; HeyCatch does set a cookie, as described above. HeyCatch&apos;s analytics do not stop when you are signed in, but they send only page views and a random account ID.
      </p>

      <h2 className="font-semibold text-lg">Service providers</h2>
      <ul className="list-disc pl-5 grid gap-1">
        <li><strong>Supabase</strong> provides the database, authentication, and file storage. The Pekko project reports region us-west-1. That is the project region, not a promise that every backup, log, or support access stays there.</li>
        <li><strong>Vercel</strong> hosts the website and API.</li>
        <li><strong>Stripe</strong> processes paid subscriptions when a paid plan is started, under standard Stripe Billing. Pekko is the seller. Publishing this policy does not enable charges.</li>
        <li><strong>Resend</strong> sends transactional service and billing email. The verified pekkotv.com sending domain reports region us-east-1. That is the sending region, not a promise that every Resend system stays there. The support address below receives mail on that domain. Use that address, not the billing sender, for privacy and support.</li>
        <li><strong>Google Firebase Cloud Messaging</strong> delivers mobile push notifications when a device token is registered and the device allows notifications. It receives the push token, the Firebase installation ID and the notification content.</li>
        <li><strong>HeyCatch</strong> (heycatch.ai): website and sign-up analytics described above.</li>
      </ul>
      <p>No exclusive residency or cross-border-transfer assurance is made. A reported project or sending region is not a guarantee that all processing stays in that region.</p>

      <h2 className="font-semibold text-lg">How long it is kept</h2>
      <p>Account and content information is kept while the account is open, and longer where a provider backup or a legal need retains it. This application does not set Supabase&apos;s backup cycle or Stripe&apos;s billing-record period, so it does not state a number of days for either. Screen uptime, playback events, offline periods, activity records, and screen alerts are removed after 90 days. Trial expiry, a failed payment, or cancellation does not by itself delete content.</p>
      <p>The account owner can update the display name, business name, and password in Settings, and can request account deletion in Settings or at <a className="underline" href="/account-deletion">/account-deletion</a>. Deletion runs 7 days after the request and can be canceled until then. It removes the account, sign-in, content, and the records listed on that page. A deletion record of the account id, user id, and request dates is kept, without the email address or the content. Do not read the screen-preservation rule as a promise that provider backups or legally required billing records disappear immediately.</p>
      <p>HeyCatch analytics data: see &quot;Product analytics (HeyCatch)&quot; above.</p>

      <h2 className="font-semibold text-lg">Choices</h2>
      <ul className="list-disc pl-5 grid gap-1">
        <li>Update the display name, business name, and password in Settings. The account email is shown there.</li>
        <li>Allow or refuse mobile notifications on the device, or turn push alerts off in Pekko Settings. A push token is stored only when notifications are used.</li>
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
