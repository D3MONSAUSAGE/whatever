import { SUPPORT_EMAIL, SUPPORT_PLACEHOLDER } from "@/lib/plans";

/** Contact details. Shows a marked placeholder until Francisco confirms the real address. */
export function ContactBlock() {
  return (
    <section className="mt-8 card p-5" aria-labelledby="contact">
      <h2 id="contact" className="font-semibold">Contact us</h2>
      {SUPPORT_EMAIL ? (
        <p className="text-sm mt-1">Email <a className="font-semibold underline" href={`mailto:${SUPPORT_EMAIL}`} data-testid="support-email">{SUPPORT_EMAIL}</a> with your account email and the screen name.</p>
      ) : (
        <p className="note-error mt-2 text-sm" data-testid="support-todo"><strong>TODO:</strong> {SUPPORT_PLACEHOLDER} No contact address is published yet.</p>
      )}
    </section>
  );
}
