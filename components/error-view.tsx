import Link from "next/link";
import { LogoMark, WaveBackdrop } from "@/components/brand";

export function ErrorView({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <main className="wave-surface relative min-h-dvh overflow-hidden grid place-items-center px-5 py-12">
      <WaveBackdrop />
      <div className="relative z-10 auth-card text-center">
        <LogoMark className="size-14 mx-auto" />
        <div className="card p-6 md:p-8 mt-6">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted leading-relaxed">{body}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {action}
            <Link href="/dashboard" className="btn btn-quiet">Go to dashboard</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
