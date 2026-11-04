import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { ContactBlock } from "@/components/contact-block";

export const metadata: Metadata = { title: "Delete your account · Pekko" };

const DELETED = [
  ["Account and sign-in (email, password hash, display name)", "Deleted"],
  ["Business name, locations, screens and screen tokens", "Deleted"],
  ["Uploaded images and videos, menu boards, brand settings", "Deleted (files removed from storage)"],
  ["Playlists, schedules, promotions, screen groups", "Deleted"],
  ["Alerts, analytics, activity and plan-milestone records", "Deleted"],
  ["Mobile app push notification tokens", "Deleted"],
  ["Plan and trial status", "Deleted"],
];
const RETAINED = [
  ["Deletion record (random account and user IDs, request and completion dates; no email or content)", "Kept as proof the request was completed. [Retention period to be confirmed.]"],
  ["Database and storage backups held by our hosting provider (Supabase)", "Deleted data can remain in backups until they rotate out. [Backup window to be confirmed.]"],
  ["Payment records held by Stripe (paid plans; not live yet)", "Invoices and payment records are kept as required for tax and accounting. [Period to be confirmed.]"],
  ["Short-lived server logs at our hosting providers (IP address, request details)", "Expire on the providers' own schedule. [To be confirmed.]"],
];

// Public page (works without the app; this is the URL for the Google Play listing).
export default function AccountDeletionInfo() {
  return (
    <PublicPage>
      <p role="note" className="note-error mb-6"><strong>DRAFT:</strong> retention periods marked [to be confirmed] are pending review.</p>
      <h1 className="text-2xl font-semibold tracking-tight">Delete your Pekko account</h1>
      <p className="mt-2 text-sm text-muted">Only the account owner can delete an account. You don&apos;t need the mobile app.</p>
      <ol className="mt-5 list-decimal pl-5 grid gap-2">
        <li><Link className="underline font-semibold" data-testid="deletion-signin" href="/login?next=/dashboard/settings/delete">Sign in</Link> with your account email and password. Forgot it? <Link className="underline" href="/forgot-password">Reset your password</Link> by email first.</li>
        <li>You land on <strong>Delete account</strong> (also under Settings).</li>
        <li>Type <strong>DELETE</strong>, enter your password again, and confirm.</li>
        <li>Deletion runs <strong>7 days</strong> later. Until then you can cancel from the same page.</li>
      </ol>
      <h2 className="font-semibold text-lg mt-8">What is deleted</h2>
      <Table rows={DELETED} testid="deleted-table" />
      <h2 className="font-semibold text-lg mt-8">What is kept, and for how long</h2>
      <Table rows={RETAINED} testid="retained-table" />
      <p className="mt-4 text-sm">Paired TVs stop playing and go back to the pairing screen. Ending a trial or plan never deletes anything; only this request does.</p>
      <ContactBlock />
    </PublicPage>
  );
}

function Table({ rows, testid }: { rows: string[][]; testid: string }) {
  return (
    <table className="mt-2 w-full text-sm" data-testid={testid}>
      <tbody>{rows.map(([a, b]) => <tr key={a} className="border-t border-line align-top"><td className="py-2 pr-3">{a}</td><td className="py-2 text-muted">{b}</td></tr>)}</tbody>
    </table>
  );
}
