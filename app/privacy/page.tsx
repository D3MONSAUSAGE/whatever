import { legalOperator } from "@/lib/legal";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy Policy · Pekko" };

const ENTITY = legalOperator();

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy (DRAFT)" updated="November 2, 2026">
      <p>This draft explains what {ENTITY} collects when you use Pekko, why, and your choices.</p>
      <h2 className="font-semibold text-lg">What we collect</h2>
      <ul className="list-disc pl-5 grid gap-1">
        <li><strong>Account details:</strong> your email address, business name, optional display name, and a securely hashed password.</li>
        <li><strong>Your content:</strong> images and videos you upload, menu boards, brand settings, playlists, schedules, promotions, locations and screen names.</li>
        <li><strong>Screen information:</strong> for each paired screen, when it last checked in, what it reported playing, playback errors, and a secret device token (stored only as a hash).</li>
        <li><strong>Usage records:</strong> a log of changes in your account (for example a playlist published) and screen uptime, used for your Analytics page. We also record a few plan milestones (for example trial started, first screen paired, plan changed) with plan names and counts only, to understand how the product is used. We use no third-party analytics or advertising trackers.</li>
        <li><strong>Mobile app:</strong> if you use the Pekko app and allow notifications, a push notification token for your device.</li>
        <li><strong>Plan and billing:</strong> your plan, trial dates and subscription status. When paid plans launch, payment details will be handled by Stripe; we will not store card numbers.</li>
        <li><strong>Technical logs:</strong> IP addresses and request details kept briefly by our hosting providers for security, rate limiting and troubleshooting.</li>
      </ul>
      <h2 className="font-semibold text-lg">How we use it</h2>
      <p>To run the Service: sign you in, store and deliver your content to your screens, show screen status, send account emails and screen alerts, prevent abuse, and fix problems. We do not sell your personal information or use your content for advertising.</p>
      <h2 className="font-semibold text-lg">Service providers</h2>
      <ul className="list-disc pl-5 grid gap-1">
        <li><strong>Supabase:</strong> database, sign-in and file storage.</li>
        <li><strong>Vercel:</strong> website and API hosting.</li>
        <li><strong>Google Firebase Cloud Messaging:</strong> delivering push notifications to the mobile app.</li>
        <li><strong>Stripe (planned):</strong> payments, once paid plans launch.</li>
      </ul>
      <p>[Email provider and data regions to be confirmed.]</p>
      <h2 className="font-semibold text-lg">Security</h2>
      <p>Each account&apos;s data is isolated from other accounts, media is served through short-lived signed links, and connections are encrypted.</p>
      <h2 className="font-semibold text-lg">Retention and deletion</h2>
      <p>We keep your data while your account is open. Usage records and alerts are removed after 90 days. When a trial or plan ends, screens pause but your content is not deleted.</p>
      <p>The account owner can request deletion in Settings or at <a className="underline" href="/account-deletion">/account-deletion</a>. Deletion runs 7 days after the request (it can be canceled until then) and removes the account, sign-in, content and records listed there. What is kept, and for how long, is listed on that page. [Backup and billing-record retention periods to be confirmed.]</p>
      <h2 className="font-semibold text-lg">Your rights</h2>
      <p>You can view and update your account details in Settings, and delete your account as described above. [Add jurisdiction-specific rights, e.g. CCPA/GDPR, as counsel advises.]</p>
      <h2 className="font-semibold text-lg">Children</h2>
      <p>Pekko is for businesses and is not directed to children under 13.</p>
      <h2 className="font-semibold text-lg">Contact</h2>
      <p>[Privacy contact email and business address to be added.]</p>
    </LegalPage>
  );
}
