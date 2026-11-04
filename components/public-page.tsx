import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/brand";

export function PublicPage({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="min-h-dvh bg-paper px-5 py-8">
      <div className={`mx-auto ${wide ? "max-w-4xl" : "max-w-2xl"}`}>
        <header className="flex items-center justify-between gap-4 mb-10">
          <Link href="/" className="inline-flex items-center gap-3" aria-label="Pekko home">
            <LogoMark className="size-10" />
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-4 text-sm font-semibold" aria-label="Main">
            <Link href="/pricing" className="hover:underline">Pricing</Link>
            <Link href="/support" className="hover:underline">Support</Link>
            <Link href="/login" className="hover:underline">Sign in</Link>
          </nav>
        </header>
        {children}
        <nav className="mt-12 flex flex-wrap gap-4 text-sm text-muted" aria-label="Legal">
          <Link href="/terms" className="hover:underline">Terms</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
          <Link href="/support" className="hover:underline">Support</Link>
          <Link href="/contact" className="hover:underline">Contact</Link>
          <Link href="/account-deletion" className="hover:underline">Delete your account</Link>
        </nav>
      </div>
    </main>
  );
}
