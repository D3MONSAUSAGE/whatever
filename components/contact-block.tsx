import { LEGAL_ADDRESS, LEGAL_OPERATOR, SUPPORT_EMAIL } from "@/lib/legal";

/** Published support and privacy contact. */
export function ContactBlock() {
  return (
    <section className="mt-8 card p-5" aria-labelledby="contact">
      <h2 id="contact" className="font-semibold">Contact us</h2>
      <p className="text-sm mt-1">
        Email <a className="font-semibold underline" href={`mailto:${SUPPORT_EMAIL}`} data-testid="support-email">{SUPPORT_EMAIL}</a> with your account email and the screen name.
      </p>
      <p className="text-sm mt-2" data-testid="support-address">{LEGAL_OPERATOR}<br />{LEGAL_ADDRESS}</p>
    </section>
  );
}
