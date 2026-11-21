import { LegalPage } from "@/components/legal-page";
import { CourtesyNotice } from "@/components/legal/courtesy-notice";
import { LEGAL_ADDRESS, LEGAL_UPDATED, SUPPORT_EMAIL } from "@/lib/legal";
import { LEGAL_OPERATOR_ES, LEGAL_OWNERSHIP_ES, LEGAL_UPDATED_ES, REFUND_POLICY_ES, planPricesEs } from "@/lib/legal-es";
import { TRIAL } from "@/lib/plans";
import { PAYMENT_GRACE_DAYS, PLAYBACK_GRACE_DAYS, TRANSITION_DAYS, TRIAL_DAYS } from "@/lib/server/entitlements";

/** Spanish courtesy translation of app/terms/page.tsx. Keep paragraph-for-paragraph with the English page. */
export function TermsEs() {
  const prices = planPricesEs();
  return (
    <LegalPage title="Términos del servicio" updated={LEGAL_UPDATED} dateLine={`Última actualización: ${LEGAL_UPDATED_ES}`} notice={<CourtesyNotice englishHref="/terms?lang=en" />}>
      <p>
        Estos términos se aplican a su uso de Pekko, un servicio para mostrar imágenes, videos y listas de reproducción en pantallas (el &quot;Servicio&quot;).
        El Servicio lo presta {LEGAL_OPERATOR_ES} (&quot;nosotros&quot;). {LEGAL_OWNERSHIP_ES}
      </p>
      <p>Domicilio comercial: {LEGAL_ADDRESS}.</p>
      <p>Al crear una cuenta, usted acepta estos términos y la <a className="underline" href="/privacy">Política de privacidad</a>.</p>

      <h2 className="font-semibold text-lg">Cuentas y contenido</h2>
      <p>Proporcione información de cuenta exacta y proteja sus credenciales de inicio de sesión. Usted es responsable de las pantallas vinculadas a su cuenta y del contenido que sube. Usted conserva la propiedad de su contenido y autoriza a Pekko a almacenarlo, procesarlo y entregarlo a sus pantallas para operar el Servicio. Usted confirma que tiene los derechos para mostrarlo y que no es ilegal, infractor ni dañino.</p>
      <p>No intente acceder a la cuenta o al contenido de otro cliente, interferir con el Servicio, sobrecargarlo ni usarlo para distribuir malware o material ilícito. Podemos limitar o suspender una cuenta que lo haga.</p>

      <h2 className="font-semibold text-lg">Planes y prueba</h2>
      <p>Los precios mensuales, en dólares estadounidenses, son: {prices}. Cada organización nueva recibe una prueba de {TRIAL_DAYS} días desde su creación, con hasta {TRIAL.screens} pantallas y sin necesidad de tarjeta. Después de esa prueba, un período de gracia de reproducción aparte, de {PLAYBACK_GRACE_DAYS} días, permite que el contenido publicado existente siga reproduciéndose antes de que las pantallas puedan pausarse si no se ha iniciado un plan de pago. Durante ese período de gracia de reproducción, la edición, la publicación, las subidas y la vinculación de pantallas nuevas quedan bloqueadas. Ese período de gracia de reproducción no extiende la prueba de {TRIAL_DAYS} días.</p>
      <p>Si selecciona un plan de pago durante la prueba de {TRIAL_DAYS} días con al menos 48 horas restantes, se guarda su método de pago y el primer cargo se realiza en la fecha original de fin de la prueba. Elegir un plan no extiende ni reinicia la prueba. Si quedan menos de 48 horas, o la prueba ya terminó, el primer cargo vence cuando usted confirma el pago. Luego las suscripciones mensuales se renuevan hasta que se cancelan.</p>

      <h2 className="font-semibold text-lg" id="billing">Facturación, cancelación y clientes existentes</h2>
      <p>Stripe procesa los pagos de suscripción, con {LEGAL_OPERATOR_ES} como vendedor, conforme a Stripe Billing estándar. Stripe no es el comerciante registrado (merchant of record). Pekko no almacena números de tarjeta. Stripe envía los recibos de pago según su propia configuración de correos a clientes. Pekko no envía un recibo de pago aparte. Estos términos no activan Stripe Tax ni fijan una tasa de impuestos. La publicación de esta página no inicia ningún cargo.</p>
      <p>Las suscripciones mensuales se renuevan hasta que se cancelan. Cancelar detiene la siguiente renovación y mantiene el acceso durante el período ya pagado. Con un límite de pantallas menor, el propietario de la cuenta decide qué pantallas siguen activas dentro del límite del plan. Las demás se pausan. La pausa porque terminó una prueba, falló un pago, se canceló una suscripción o una pantalla supera el límite del plan no elimina archivos, listas de reproducción, horarios ni configuración. Eso es distinto de la eliminación de la cuenta solicitada por el propietario.</p>
      <p>Las organizaciones que ya existían antes de la facturación de pago conservan acceso completo. Reciben {TRANSITION_DAYS} días de acceso completo continuo después de que se envíe correctamente un aviso anticipado de facturación. Esa cuenta regresiva comienza solo cuando el correo del aviso se envía con éxito. No comienza cuando alguien inicia sesión, y publicar o leer esta página no constituye ese aviso. Los recordatorios de facturación y la aplicación de las restricciones de facturación se activan por separado, y esta página no los activa.</p>
      <p>Un pago de suscripción fallido recibe {PAYMENT_GRACE_DAYS} días de gracia de reproducción a partir del primer pago fallido. Un fallo posterior dentro del mismo período de pago vencido no cambia la fecha límite. El panel muestra la fecha límite para actualizar los datos de pago antes de que la reproducción pueda pausarse. Su contenido no se elimina.</p>

      <h2 className="font-semibold text-lg">Reembolsos</h2>
      <p>{REFUND_POLICY_ES}</p>

      <h2 className="font-semibold text-lg">Cierre de su cuenta</h2>
      <p>Puede dejar de usar el Servicio en cualquier momento. El propietario de la cuenta puede solicitar la eliminación desde Configuración o en <a className="underline" href="/account-deletion">/account-deletion</a>. La eliminación se realiza 7 días después de la solicitud y se puede cancelar hasta entonces. Podemos suspender o cerrar una cuenta que incumpla estos términos.</p>

      <h2 className="font-semibold text-lg">Contacto</h2>
      <p>
        <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a><br />
        {LEGAL_OPERATOR_ES}<br />
        {LEGAL_ADDRESS}
      </p>
    </LegalPage>
  );
}
