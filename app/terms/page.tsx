import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms of Service · Seemple" };

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="October 29, 2026">
      <p>These terms cover your use of Seemple, a service from Seemple Technologies (&quot;we&quot;) for showing images, videos and playlists on screens (&quot;the Service&quot;). By creating an account you agree to them.</p>
      <h2 className="font-semibold text-lg">Your account</h2>
      <p>You must give accurate information and keep your password safe. You are responsible for what happens under your account, including the screens you pair to it. Tell us right away if you think someone else has access.</p>
      <h2 className="font-semibold text-lg">Your content</h2>
      <p>You keep ownership of the media you upload. You give us permission to store, process (for example, resize or create previews) and deliver it to your screens, only to run the Service. You confirm you have the rights to show it, and that it is not illegal, infringing, or harmful.</p>
      <h2 className="font-semibold text-lg">Acceptable use</h2>
      <p>Do not try to access other customers&apos; accounts or content, interfere with the Service, overload it, or use it to send malware or unlawful material. We may limit or suspend accounts that do.</p>
      <h2 className="font-semibold text-lg">Fees</h2>
      <p>[Pricing, billing, trials and refunds to be added before paid plans launch.]</p>
      <h2 className="font-semibold text-lg">Availability</h2>
      <p>We work to keep the Service running, and screens keep playing downloaded content during short outages where the device supports it, but we do not guarantee uninterrupted service. We may change or improve features over time.</p>
      <h2 className="font-semibold text-lg">Ending your account</h2>
      <p>You can stop using the Service at any time. We may suspend or close accounts that break these terms. [Data export and deletion timelines to be confirmed.]</p>
      <h2 className="font-semibold text-lg">Disclaimers and liability</h2>
      <p>[Warranty disclaimer, limitation of liability, indemnity, governing law and dispute terms to be written by counsel.]</p>
      <h2 className="font-semibold text-lg">Contact</h2>
      <p>[Support email and business address to be added.]</p>
    </LegalPage>
  );
}
