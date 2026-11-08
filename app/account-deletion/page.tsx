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
  ["Deletion record (account id, user id, request and completion dates; no email or content)", "Kept as the record that the request finished. This application does not set a destruction date for that row."],
  ["Database and storage backups held by Supabase", "Deleted data can remain in a backup until Supabase's own backup cycle drops it. This application does not set that cycle."],
  ["Payment records held by Stripe, if a paid subscription was started", "Pekko does not store card numbers. Stripe keeps its own billing records. This application does not set Stripe's retention period, and this page does not enable charges."],
  ["Server logs and pairing rate limits", "Error logs written by this app record the method, path, and a short message, not headers, cookies, or bodies. Pairing limits use the IP address as the limit key. Provider log retention is not set here."],
];

// Public page (works without the app; this is the URL for the Google Play listing).
export default function AccountDeletionInfo() {
  return (
    <PublicPage>
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
