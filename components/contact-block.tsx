import { LEGAL_ADDRESS, LEGAL_OPERATOR, SUPPORT_EMAIL } from "@/lib/legal";
import { getT } from "@/lib/i18n/server";
import { rich } from "@/components/i18n/rich";

/** Published support and privacy contact. The address is legal text, never translated; Spanish courtesy pages pass the Spanish operator line. */
export async function ContactBlock({ operator = LEGAL_OPERATOR }: { operator?: string } = {}) {
  const t = await getT();
  return (
    <section className="mt-8 card p-5" aria-labelledby="contact">
      <h2 id="contact" className="font-semibold">{t("contact.heading")}</h2>
      <p className="text-sm mt-1">
        {rich(t("contact.body", { email: SUPPORT_EMAIL }), {
          link: (c) => <a className="font-semibold underline" href={`mailto:${SUPPORT_EMAIL}`} data-testid="support-email">{c}</a>,
        })}
      </p>
      <p className="text-sm mt-2" data-testid="support-address">{operator}<br />{LEGAL_ADDRESS}</p>
    </section>
  );
}
