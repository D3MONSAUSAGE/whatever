import { PublicPage } from "@/components/public-page";
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <PublicPage>
      <article>
        <p role="note" data-testid="legal-draft" className="note-error mb-6">
          <strong>Draft — not yet reviewed by a lawyer.</strong> This text is a working draft and is not final.
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted mt-1 mb-6">Last updated {updated}</p>
        <div className="legal grid gap-4 text-[15px] leading-relaxed">{children}</div>
      </article>
    </PublicPage>
  );
}
