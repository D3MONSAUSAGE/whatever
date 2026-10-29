import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy Policy · Seemple" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="October 29, 2026">
      <p>This policy explains what Seemple Technologies collects when you use Seemple, why, and your choices.</p>
      <h2 className="font-semibold text-lg">What we collect</h2>
      <ul className="list-disc pl-5 grid gap-1">
        <li><strong>Account details:</strong> your email address, business name, optional display name, and a securely hashed password.</li>
        <li><strong>Your content:</strong> images and videos you upload, playlists, schedules, locations and screen names.</li>
        <li><strong>Screen information:</strong> for each paired screen, when it last checked in, its playback errors, and a secret device token (stored only as a hash).</li>
        <li><strong>Technical logs:</strong> IP addresses and request details kept briefly by our hosting providers for security, rate limiting and troubleshooting.</li>
      </ul>
      <h2 className="font-semibold text-lg">How we use it</h2>
      <p>To run the Service: sign you in, store and deliver your content to your screens, show screen status, send account emails such as password resets, prevent abuse, and fix problems. We do not sell your personal information or use your content for advertising.</p>
      <h2 className="font-semibold text-lg">Service providers</h2>
      <p>We use Supabase (database, sign-in and file storage) and Vercel (website hosting). They process data on our behalf. [Add email provider once chosen; confirm data regions.]</p>
      <h2 className="font-semibold text-lg">Security</h2>
      <p>Each account&apos;s data is isolated from other accounts, media is served through short-lived signed links, and connections are encrypted.</p>
      <h2 className="font-semibold text-lg">Retention and deletion</h2>
      <p>We keep your data while your account is open. [Deletion timeline after account closure, and backup retention, to be confirmed.]</p>
      <h2 className="font-semibold text-lg">Your rights</h2>
      <p>You can view and update your account details in Settings. To request a copy or deletion of your data, contact us. [Add jurisdiction-specific rights, e.g. CCPA/GDPR, as counsel advises.]</p>
      <h2 className="font-semibold text-lg">Children</h2>
      <p>Seemple is for businesses and is not directed to children under 13.</p>
      <h2 className="font-semibold text-lg">Contact</h2>
      <p>[Privacy contact email and business address to be added.]</p>
    </LegalPage>
  );
}
