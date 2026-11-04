import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { ContactBlock } from "@/components/contact-block";

export const metadata: Metadata = { title: "Contact · Pekko" };

export default function Contact() {
  return (
    <PublicPage>
      <h1 className="text-2xl font-semibold tracking-tight">Contact</h1>
      <p className="text-muted mt-1">Most questions are answered on the <Link className="underline" href="/support">Support</Link> page.</p>
      <ContactBlock />
    </PublicPage>
  );
}
