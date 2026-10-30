import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/brand";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-paper px-5 py-10">
      <article className="mx-auto max-w-2xl">
        <Link href="/login" className="inline-flex items-center gap-3 mb-8" aria-label="Pekko home">
          <LogoMark className="size-10" />
          <Wordmark />
        </Link>
        <p role="note" data-testid="legal-draft" className="note-error mb-6">
          <strong>Draft — not yet reviewed by a lawyer.</strong> This text is a working draft and is not final.
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted mt-1 mb-6">Last updated {updated}</p>
        <div className="legal grid gap-4 text-[15px] leading-relaxed">{children}</div>
        <nav className="mt-10 flex gap-4 text-sm text-muted" aria-label="Legal">
          <Link href="/terms" className="hover:underline">Terms</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
          <Link href="/login" className="hover:underline">Sign in</Link>
        </nav>
      </article>
    </main>
  );
}
