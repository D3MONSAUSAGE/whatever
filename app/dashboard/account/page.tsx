"use client";

import Link from "next/link";
import { ContactBlock } from "@/components/contact-block";
import { ManageBilling } from "@/components/manage-billing";
import { IconGear } from "@/components/icons";
import { PageHeader } from "@/components/ui";

export default function AccountHub() {
  return (
    <section className="min-w-0">
      <PageHeader title="Account" eyebrow="Pekko" lede="Settings, the plan you already have, and how to reach support." icon={<IconGear />} />
      <ul className="grid gap-3 md:grid-cols-3">
        <li className="card p-4">
          <h2 className="font-semibold">Settings</h2>
          <p className="text-sm text-muted mt-1">Name, password, alerts, and signing out.</p>
          <Link href="/dashboard/settings" className="btn min-h-11 mt-3">Open settings</Link>
        </li>
        <li className="card p-4">
          <h2 className="font-semibold">Billing</h2>
          <p className="text-sm text-muted mt-1">Your plan, invoices, and payment method.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/dashboard/billing" className="btn min-h-11">Open billing</Link>
            <ManageBilling className="btn-quiet" />
          </div>
        </li>
        <li className="card p-4">
          <h2 className="font-semibold">Support</h2>
          <p className="text-sm text-muted mt-1">The same contact as the public support page.</p>
          <Link href="/support" className="btn min-h-11 mt-3">Open support</Link>
        </li>
      </ul>
      <ContactBlock />
    </section>
  );
}
