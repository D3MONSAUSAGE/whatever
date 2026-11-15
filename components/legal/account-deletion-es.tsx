import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { ContactBlock } from "@/components/contact-block";
import { CourtesyNotice } from "@/components/legal/courtesy-notice";
import { LEGAL_OPERATOR_ES } from "@/lib/legal-es";

/** Spanish courtesy translation of /account-deletion. The English page governs. */
export const ACCOUNT_DELETION_TITLE_ES = "Eliminar su cuenta · Pekko";

const DELETED_ES = [
  ["Cuenta e inicio de sesión (correo electrónico, hash de la contraseña, nombre visible)", "Se elimina"],
  ["Nombre del negocio, ubicaciones, pantallas y tokens de pantalla", "Se eliminan"],
  ["Imágenes y videos subidos, menús digitales, configuración de marca", "Se eliminan (los archivos se borran del almacenamiento)"],
  ["Listas de reproducción, horarios, promociones, grupos de pantallas", "Se eliminan"],
  ["Alertas, estadísticas, actividad y registros de hitos del plan", "Se eliminan"],
  ["Tokens de notificaciones push de la aplicación móvil", "Se eliminan"],
  ["Estado del plan y de la prueba", "Se elimina"],
];
const RETAINED_ES = [
  ["Registro de eliminación (id de la cuenta, id del usuario, fechas de la solicitud y de su finalización; sin correo electrónico ni contenido)", "Se conserva como constancia de que la solicitud se completó. Esta aplicación no fija una fecha de destrucción para esa fila."],
  ["Copias de seguridad de la base de datos y del almacenamiento en poder de Supabase", "Los datos eliminados pueden permanecer en una copia de seguridad hasta que el propio ciclo de copias de seguridad de Supabase los descarte. Esta aplicación no fija ese ciclo."],
  ["Registros de pago en poder de Stripe, si se inició una suscripción de pago", "Pekko no almacena números de tarjeta. Stripe conserva sus propios registros de facturación. Esta aplicación no fija el periodo de conservación de Stripe, y esta página no activa cobros."],
  ["Registros del servidor y límites de vinculación", "Los registros de errores generados por esta aplicación registran el método, la ruta y un mensaje breve, no los encabezados, las cookies ni el cuerpo de las solicitudes. Los límites de vinculación usan la dirección IP como clave del límite. La conservación de registros del proveedor no se fija aquí."],
];

export function AccountDeletionEs() {
  return (
    <PublicPage>
      <div lang="es">
        <CourtesyNotice englishHref="/account-deletion?lang=en" />
        <h1 className="text-2xl font-semibold tracking-tight">Elimine su cuenta de Pekko</h1>
        <p className="mt-2 text-sm text-muted">Solo el propietario de la cuenta puede eliminarla. No necesita la aplicación móvil.</p>
        <ol className="mt-5 list-decimal pl-5 grid gap-2">
          <li><Link className="underline font-semibold" data-testid="deletion-signin" href="/login?next=/dashboard/settings/delete">Inicie sesión</Link> con el correo electrónico y la contraseña de su cuenta. ¿La olvidó? Primero <Link className="underline" href="/forgot-password">restablezca su contraseña</Link> por correo electrónico.</li>
          <li>Llegará a <strong>Eliminar la cuenta</strong> (también en Configuración).</li>
          <li>Escriba <strong>DELETE</strong>, vuelva a introducir su contraseña y confirme.</li>
          <li>La eliminación se realiza <strong>7 días</strong> después. Hasta entonces puede cancelarla desde la misma página.</li>
        </ol>
        <h2 className="font-semibold text-lg mt-8">Qué se elimina</h2>
        <Table rows={DELETED_ES} testid="deleted-table" />
        <h2 className="font-semibold text-lg mt-8">Qué se conserva y durante cuánto tiempo</h2>
        <Table rows={RETAINED_ES} testid="retained-table" />
        <p className="mt-4 text-sm">Las TV vinculadas dejan de reproducir contenido y vuelven a la pantalla de vinculación. Terminar una prueba o un plan nunca elimina nada; solo esta solicitud lo hace.</p>
        <ContactBlock operator={LEGAL_OPERATOR_ES} />
      </div>
    </PublicPage>
  );
}

function Table({ rows, testid }: { rows: string[][]; testid: string }) {
  return (
    <table className="mt-2 w-full text-sm" data-testid={testid}>
      <tbody>{rows.map(([a, b]) => <tr key={a} className="border-t border-line align-top"><td className="py-2 pr-3">{a}</td><td className="py-2 text-muted">{b}</td></tr>)}</tbody>
    </table>
  );
}
