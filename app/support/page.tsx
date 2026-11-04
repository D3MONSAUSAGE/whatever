import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { ContactBlock } from "@/components/contact-block";

export const metadata: Metadata = { title: "Support · Pekko" };

const FAQ: { q: string; a: React.ReactNode }[] = [
  { q: "The TV shows a 6-digit code and nothing else", a: <>It isn&apos;t paired yet. In Pekko, open <strong>Displays → Add screen</strong> and type the code. Codes expire after a few minutes; reload the TV page for a new one.</> },
  { q: "What address do I open on the TV?", a: <>Open the TV&apos;s web browser and go to <strong>/player</strong> on this site (for example <code>yourpekko.site/player</code>). The exact address is on the Displays page with a copy button.</> },
  { q: "I published but the TV still shows the old content", a: <>Check the TV is online (Displays shows <em>Online</em>). The TV checks in about every 30 seconds. Saving a draft doesn&apos;t change the TV; press <strong>Publish</strong>.</> },
  { q: "The screen says “This screen is paused”", a: <>Your trial or plan has ended, or this screen is beyond your plan&apos;s screen limit. Open <strong>Settings → Plan &amp; billing</strong>. Your content is kept and the TV resumes on its own.</> },
  { q: "The screen says it's offline", a: <>Check the TV&apos;s Wi-Fi and power. It keeps playing saved content without internet and catches up when it reconnects.</> },
  { q: "My video won't upload or play", a: <>Use MP4 (H.264). Very large files take longer; keep the page open until it finishes.</> },
  { q: "I forgot my password", a: <>Use <Link className="underline" href="/forgot-password">Forgot password</Link>. The link works once and expires in an hour; check spam.</> },
  { q: "How do I delete my account?", a: <>See <Link className="underline" href="/account-deletion">Delete your account</Link>.</> },
];

export default function Support() {
  return (
    <PublicPage>
      <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
      <p className="text-muted mt-1">Quick fixes for common problems.</p>
      <div className="mt-6 grid gap-3">
        {FAQ.map((f) => (
          <details key={f.q} className="card p-4">
            <summary className="font-semibold cursor-pointer">{f.q}</summary>
            <p className="mt-2 text-sm leading-relaxed">{f.a}</p>
          </details>
        ))}
      </div>
      <ContactBlock />
    </PublicPage>
  );
}
