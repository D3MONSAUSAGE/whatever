import { COURTESY_NOTICE_ES, ENGLISH_ORIGINAL_ES } from "@/lib/legal-es";

/** Top-of-page notice on Spanish courtesy translations: the English version governs. */
export function CourtesyNotice({ englishHref }: { englishHref: string }) {
  return (
    <div role="note" lang="es" className="note-warn mb-6" data-testid="courtesy-notice">
      <p className="font-semibold">{COURTESY_NOTICE_ES}</p>
      <p className="mt-1">
        <a className="underline font-semibold" href={englishHref} hrefLang="en" data-testid="english-original">{ENGLISH_ORIGINAL_ES}</a>
      </p>
    </div>
  );
}
