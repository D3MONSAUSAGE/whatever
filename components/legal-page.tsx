import { PublicPage } from "@/components/public-page";

export function LegalPage({ title, updated, dateLine, children }: { title: string; updated: string; dateLine?: string; children: React.ReactNode }) {
  return (
    <PublicPage>
      <article>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted mt-1 mb-6" data-testid="legal-date">{dateLine ?? `Last updated ${updated}`}</p>
        <div className="legal grid gap-4 text-[15px] leading-relaxed">{children}</div>
      </article>
    </PublicPage>
  );
}
