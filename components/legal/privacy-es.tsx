import { LegalPage } from "@/components/legal-page";
import { CourtesyNotice } from "@/components/legal/courtesy-notice";
import { LEGAL_ADDRESS, LEGAL_PRIVACY_UPDATED, SUPPORT_EMAIL } from "@/lib/legal";
import { LEGAL_OPERATOR_ES, LEGAL_OWNERSHIP_ES, LEGAL_PRIVACY_UPDATED_ES } from "@/lib/legal-es";

/** Spanish courtesy translation of app/privacy/page.tsx. Keep paragraph-for-paragraph with the English page. */
export function PrivacyEs() {
  return (
    <LegalPage title="Política de privacidad" updated={LEGAL_PRIVACY_UPDATED} dateLine={`Vigente desde el ${LEGAL_PRIVACY_UPDATED_ES}. Última actualización: ${LEGAL_PRIVACY_UPDATED_ES}.`} notice={<CourtesyNotice englishHref="/privacy?lang=en" />}>
      <p>Esta política explica qué información procesa {LEGAL_OPERATOR_ES} cuando usted usa Pekko, para qué y las opciones que el producto realmente ofrece. {LEGAL_OWNERSHIP_ES}</p>

      <h2 className="font-semibold text-lg" id="changes">Cambios en esta política</h2>
      <p>
        Antes de que un cambio importante entre en vigor, la política actualizada se publica en esta página con su nueva fecha de vigencia. La página sigue enlazada desde el pie del sitio.
        Cuando se requiera un aviso, o cuando un aviso sea apropiado para una cuenta cuya dirección de correo electrónico tenga Pekko, ese aviso se envía al correo de la cuenta.
        Pekko no envía automáticamente un correo por cada modificación de esta página. La publicación de esta sección no envía ningún correo.
      </p>

      <h2 className="font-semibold text-lg">Información que se usa para operar Pekko</h2>
      <ul className="list-disc pl-5 grid gap-1">
        <li><strong>Cuenta.</strong> Dirección de correo electrónico, nombre del negocio, un nombre visible opcional, y cuándo se creó la cuenta y cuándo inició sesión por última vez. Las contraseñas de inicio de sesión las almacena Supabase Auth, no como texto plano en los registros de cuentas de Pekko.</li>
        <li><strong>Contenido y configuración.</strong> Imágenes, videos, menús digitales y configuración de marca que usted sube, además de listas de reproducción, horarios, promociones, ubicaciones, grupos de pantallas y nombres de pantallas.</li>
        <li><strong>Pantallas.</strong> Para cada pantalla vinculada: cuándo se reportó por última vez, lo que informó que estaba reproduciendo, errores de reproducción, períodos sin conexión y un token del dispositivo que se almacena solo como hash. No se recopila nada sobre las personas que pasan frente a una pantalla.</li>
        <li><strong>Actividad propia (de primera parte).</strong> Registros de publicaciones, cambios del contenido de las pantallas, vinculación y eliminación de pantallas, cambios de horarios, y cargas o eliminaciones. También el tiempo de actividad por hora de las pantallas y la reproducción confirmada. Los hitos del producto de la cuenta registran el inicio de la prueba, la primera pantalla vinculada, la primera publicación, el cambio de plan, la cancelación, cuántas pantallas se vincularon durante la prueba y el vencimiento de la prueba. Esas filas de hitos no se muestran en su lista de actividad.</li>
        <li><strong>Plan y facturación.</strong> Plan, fechas de la prueba, estado de la suscripción, el período pagado actual y los identificadores de cliente y de suscripción de Stripe cuando existe una suscripción de pago. Pekko no almacena números de tarjeta.</li>
        <li><strong>Notificaciones push móviles.</strong> Si usa la app de Pekko y el dispositivo permite notificaciones, un token push de ese dispositivo. Para entregar las notificaciones, el software Firebase de Google incluido en la app también crea un ID de instalación de Firebase en el dispositivo y lo comparte con Google; Pekko no almacena ni usa ese ID.</li>
        <li><strong>Límites contra el abuso y registros.</strong> Los intentos de vinculación se limitan usando la dirección IP de la solicitud como clave del límite de frecuencia. Esa clave puede permanecer en la tabla de límites de frecuencia; esta aplicación no fija una fecha de destrucción aparte para ella. Los registros de errores de Vercel generados por esta aplicación incluyen el método, la ruta y un mensaje breve. No incluyen encabezados, cookies ni cuerpos de las solicitudes.</li>
      </ul>

      <h2 className="font-semibold text-lg">Para qué se usa</h2>
      <p>Para iniciar su sesión, almacenar y entregar su contenido a sus pantallas, mostrar el estado de las pantallas, enviar alertas de la cuenta y de las pantallas, gestionar la facturación cuando se inicia un plan de pago, medir qué anuncios y canales traen nuevos registros, contar las visitas al sitio web público, elaborar estadísticas internas sobre el uso del Servicio, dar soporte a los clientes, limitar el abuso y solucionar problemas del Servicio. Usted conserva la propiedad de su contenido. No vendemos información personal. No hay ninguna venta de la cual excluirse, y esta política no es una declaración de cumplimiento de ninguna ley de privacidad en particular.</p>

      <h2 className="font-semibold text-lg" id="staff-access">Quién en Pekko puede ver los datos de su cuenta</h2>
      <p>
        Un número reducido de personal autorizado de Pekko puede ver datos de la cuenta y de uso en una página interna privada, para dar soporte a los clientes y operar el Servicio.
        Esa página muestra el correo de la cuenta y si está confirmado, la fecha de registro, el plan, el estado de la prueba y de la suscripción, si hay pantallas vinculadas y si han mostrado contenido, la cantidad de pantallas y la hora de su última conexión, la fecha y el tipo de la actividad más reciente (incluido el último inicio de sesión), si la cuenta está marcada como interna o de prueba, si la cuenta está marcada para eliminación y el origen de campaña de la primera visita que se describe más abajo.
        No muestra contraseñas, datos de tarjetas de pago, su contenido subido, listas de reproducción, menús ni mensajes.
        Lee los registros actuales de la cuenta, así que una cuenta eliminada deja de aparecer allí.
      </p>

      <h2 className="font-semibold text-lg">Qué se mide y qué no</h2>
      <p>Los registros anteriores son registros propios de las pantallas y los cambios de la propia cuenta. Esta aplicación no incluye una red publicitaria. Usa dos tipos de analítica web: el contador de visitas propio de Pekko, sin cookies, y un servicio de analítica de producto de un tercero, HeyCatch, ambos descritos más abajo. El cliente de inicio de sesión del panel almacena la sesión en el navegador y llama a la API de Pekko con un token de portador (bearer token).</p>
      <p>El correo transaccional se envía a través de Resend como texto plano. La solicitud de envío no activa el seguimiento de aperturas ni de clics, y el dominio de envío verificado pekkotv.com reporta el seguimiento de aperturas y de clics desactivado. Esto describe esta aplicación y esa configuración del dominio. No es una promesa de que un proveedor nunca registre ni mida sus propios sistemas.</p>

      <h2 className="font-semibold text-lg">Atribución de anuncios y campañas</h2>
      <p>
        Cuando usted llega por primera vez a pekkotv.com, podemos guardar las etiquetas de campaña del enlace (fuente, medio, campaña, contenido y término) y la dirección del sitio que lo envió (el referente) en una cookie propia y en el almacenamiento local de su navegador por hasta 90 días.
        Si crea una cuenta en ese tiempo, copiamos esta información de la primera visita a su cuenta una sola vez, al registrarse, y no la sobrescribimos después.
        La usamos solo para medir qué anuncios y canales traen nuevos registros, y el personal autorizado de Pekko puede ver el origen de la primera visita de una cuenta en la página interna descrita arriba. No la vendemos ni la compartimos con anunciantes ni redes publicitarias, y no usamos píxeles publicitarios. Sí usamos un servicio de analítica de un tercero, HeyCatch, descrito más abajo.
        La copia en su cuenta se elimina cuando se elimina su cuenta.
      </p>

      <h2 className="font-semibold text-lg" id="product-analytics">Analítica de producto (HeyCatch)</h2>
      <p>Pekko usa HeyCatch (<a className="underline" href="https://heycatch.ai">heycatch.ai</a>) para entender cómo llegan los visitantes a pekkotv.com, qué botones usan y si terminan de crear una cuenta. Pekko decide qué se recopila y para qué, y HeyCatch actúa como nuestro proveedor de servicios (encargado del tratamiento).</p>
      <p><strong>Qué se guarda en su dispositivo.</strong> Cuando abre pekkotv.com, el código de HeyCatch crea una cookie propia llamada ph_phc_…_posthog en pekkotv.com, con una duración de hasta 365 días. Contiene un identificador aleatorio de dispositivo y de visitante que reconoce su navegador en visitas posteriores, y guarda una copia de la misma información en el almacenamiento local de su navegador y, mientras la pestaña está abierta, en el almacenamiento de sesión (incluido un identificador de sesión aleatorio).</p>
      <p><strong>Qué se envía.</strong> Con cada página vista, y con los clics en las páginas públicas (inicio, funciones, precios, preguntas frecuentes, soporte y contacto; en inglés y en español), su navegador envía a HeyCatch: la dirección de la página (sin la parte posterior a # y sin los datos de los enlaces de inicio de sesión o confirmación), el sitio que lo envió, las etiquetas de campaña del enlace, el título de la página en las páginas públicas, el texto y el tipo del botón o enlace en el que hizo clic en las páginas públicas, su navegador, sistema operativo, tipo de dispositivo, idioma, zona horaria, tamaño de pantalla y agente de usuario. Los servidores de HeyCatch también reciben su dirección IP con la solicitud y pueden deducir una ubicación aproximada. En las páginas de inicio de sesión, registro y panel solo se envían las páginas vistas.</p>
      <p><strong>Creación de cuenta.</strong> Cuando se crea una cuenta nueva enviamos un único evento de &quot;registro completado&quot; y lo vinculamos con la visita que lo originó, mediante un identificador de cuenta aleatorio. Así podemos ver cuántas personas que hacen clic en &quot;Crear mi menú gratis&quot; terminan registrándose. Después de iniciar sesión, las páginas vistas posteriores se asocian a ese identificador de cuenta aleatorio.</p>
      <p><strong>Lo que nunca se envía.</strong> Su correo electrónico, su nombre, el nombre de su negocio, el contenido de menús o pantallas, contraseñas, tokens de inicio de sesión o confirmación, ni nada de lo que escriba en un formulario. Las páginas de personal y de desarrollo, el reproductor de TV y las páginas de vinculación no envían nada.</p>
      <p><strong>Su elección.</strong> Si su navegador envía Do Not Track (No rastrear) o Global Privacy Control, el código de HeyCatch no se inicia: no crea ninguna cookie y no envía nada. No hay banner de cookies; esta señal es la forma de optar por no participar en pekkotv.com. También puede bloquear o borrar la cookie ph_phc_… y el almacenamiento en la configuración de su navegador; la siguiente visita podría crear una nueva. HeyCatch indica que él mismo no responde a esas señales, por lo que las aplicamos antes de que se envíe nada.</p>
      <p><strong>Quién lo ve y por cuánto tiempo.</strong> Los datos los conserva HeyCatch, que aloja la analítica de producto en la nube de PostHog en EE. UU. y usa otros proveedores de infraestructura indicados en su política de privacidad (<a className="underline" href="https://heycatch.ai/privacy">heycatch.ai/privacy</a>). HeyCatch conserva estos datos mientras la suscripción de Pekko esté activa y durante dos meses después de que termine, y guarda registros de servidor hasta 13 meses. No vendemos estos datos ni los usamos para publicidad.</p>

      <h2 className="font-semibold text-lg" id="website-statistics">Estadísticas de visitas al sitio web</h2>
      <p>
        En las páginas públicas de pekkotv.com (inicio, funciones, precios, preguntas frecuentes, soporte y contacto, en inglés y en español), Pekko cuenta las visitas con su propio contador. No crea ninguna cookie ni guarda direcciones IP, huellas del navegador ni identificadores persistentes.
        Cuando se carga una de estas páginas, su navegador envía a Pekko la dirección de la página sin sus parámetros de consulta. En la primera página de una visita también envía la dirección del sitio que lo envió, de la que solo se guarda el nombre del sitio, y las etiquetas de campaña del enlace (fuente, medio y campaña).
        Para contar visitantes únicos, el servidor de Pekko combina su dirección IP y la cadena de agente de usuario de su navegador con un valor aleatorio que cambia cada día, y los convierte en un código de un solo sentido. La dirección IP y la cadena de agente de usuario no se guardan.
        Ese código se conserva solo durante el día en que se crea y luego se sustituye por un total diario. Cada valor aleatorio diario se elimina a los dos días, así que las visitas no se pueden vincular entre días ni rastrear hasta usted.
        Lo que se conserva son totales diarios por página y fuente de tráfico, que el personal autorizado de Pekko ve en la página interna descrita arriba. Estos totales se eliminan a los 400 días.
        Un indicador por pestaña en el almacenamiento de sesión de su navegador, que nunca se envía a Pekko, distingue la primera página de una visita de las siguientes.
        No se cuentan las visitas mientras usted haya iniciado sesión en Pekko, ni cuando su navegador envía una señal de Global Privacy Control o Do Not Track. No se cuentan como visitas los paneles, las páginas de inicio de sesión, el reproductor de TV ni estas páginas legales.
        El mismo contador también guarda totales diarios de algunos pasos para empezar una prueba: los clics en un botón de prueba (y en qué parte de la página estaba), las vistas previas de plantillas usadas en la página de inicio, las vistas y los envíos del formulario de registro, y el tipo de problema al registrarse (por ejemplo, una contraseña demasiado corta). Solo se guardan el paso y un total diario. Su correo, el contenido de los campos del formulario y cualquier identificador nunca se envían con estos pasos.
        Estas estadísticas no se vinculan con ninguna cuenta y no se comparten con anunciantes ni redes publicitarias.
        Este contador es independiente de HeyCatch. Lo que el contador dice sobre no crear cookies ni guardar identificadores persistentes se aplica solo al contador; HeyCatch sí crea una cookie, como se describe arriba. La analítica de HeyCatch no se detiene cuando ha iniciado sesión, pero solo envía páginas vistas y un identificador de cuenta aleatorio.
      </p>

      <h2 className="font-semibold text-lg">Proveedores de servicios</h2>
      <ul className="list-disc pl-5 grid gap-1">
        <li><strong>Supabase</strong> proporciona la base de datos, la autenticación y el almacenamiento de archivos. El proyecto de Pekko reporta la región us-west-1. Esa es la región del proyecto, no una promesa de que toda copia de seguridad, registro o acceso de soporte permanezca allí.</li>
        <li><strong>Vercel</strong> aloja el sitio web y la API.</li>
        <li><strong>Stripe</strong> procesa las suscripciones de pago cuando se inicia un plan de pago, conforme a Stripe Billing estándar. Pekko es el vendedor. La publicación de esta política no activa cargos.</li>
        <li><strong>Resend</strong> envía correos transaccionales del servicio y de facturación. El dominio de envío verificado pekkotv.com reporta la región us-east-1. Esa es la región de envío, no una promesa de que todos los sistemas de Resend permanezcan allí. La dirección de soporte que aparece abajo recibe correo en ese dominio. Use esa dirección, no el remitente de facturación, para asuntos de privacidad y soporte.</li>
        <li><strong>Google Firebase Cloud Messaging</strong> entrega las notificaciones push móviles cuando se registra un token de dispositivo y el dispositivo permite notificaciones. Recibe el token push, el ID de instalación de Firebase y el contenido de la notificación.</li>
        <li><strong>HeyCatch</strong> (heycatch.ai): analítica del sitio y de registros descrita arriba.</li>
      </ul>
      <p>No se ofrece ninguna garantía de residencia exclusiva de los datos ni de transferencia internacional. Una región reportada de proyecto o de envío no garantiza que todo el procesamiento permanezca en esa región.</p>

      <h2 className="font-semibold text-lg">Cuánto tiempo se conserva</h2>
      <p>La información de la cuenta y el contenido se conservan mientras la cuenta está abierta, y por más tiempo cuando una copia de seguridad de un proveedor o una necesidad legal los retiene. Esta aplicación no fija el ciclo de copias de seguridad de Supabase ni el período de conservación de los registros de facturación de Stripe, por lo que no indica un número de días para ninguno de los dos. El tiempo de actividad de las pantallas, los eventos de reproducción, los períodos sin conexión, los registros de actividad y las alertas de pantallas se eliminan después de 90 días. El vencimiento de la prueba, un pago fallido o una cancelación no eliminan contenido por sí solos.</p>
      <p>El propietario de la cuenta puede actualizar el nombre visible, el nombre del negocio y la contraseña en Configuración, y puede solicitar la eliminación de la cuenta en Configuración o en <a className="underline" href="/account-deletion">/account-deletion</a>. La eliminación se realiza 7 días después de la solicitud y se puede cancelar hasta entonces. Elimina la cuenta, el inicio de sesión, el contenido y los registros que se indican en esa página. Se conserva un registro de eliminación con el id de la cuenta, el id del usuario y las fechas de la solicitud, sin la dirección de correo electrónico ni el contenido. No interprete la regla de conservación de las pantallas como una promesa de que las copias de seguridad de los proveedores o los registros de facturación exigidos por ley desaparecen de inmediato.</p>
      <p>Datos de analítica de HeyCatch: vea &quot;Analítica de producto (HeyCatch)&quot; arriba.</p>

      <h2 className="font-semibold text-lg">Opciones</h2>
      <ul className="list-disc pl-5 grid gap-1">
        <li>Actualice el nombre visible, el nombre del negocio y la contraseña en Configuración. El correo de la cuenta se muestra allí.</li>
        <li>Permita o rechace las notificaciones móviles en el dispositivo, o desactive las alertas push en Configuración de Pekko. Un token push se almacena solo cuando se usan notificaciones.</li>
        <li>Cancele una suscripción desde el portal de facturación que proporciona Stripe una vez que exista un plan de pago. La cancelación detiene la siguiente renovación.</li>
        <li>Decida qué pantallas siguen activas cuando un plan incluye menos pantallas. Las demás se pausan. El contenido se conserva.</li>
        <li>Solicite la eliminación, o cancele una eliminación pendiente, como se describe arriba.</li>
        <li>Envíe un correo al contacto que aparece abajo para hacer una solicitud de privacidad sobre su cuenta. Es posible que necesitemos confirmar que usted controla la cuenta antes de atenderla.</li>
      </ul>

      <h2 className="font-semibold text-lg">Menores</h2>
      <p>Pekko es para negocios y no está dirigido a menores de 13 años.</p>

      <h2 className="font-semibold text-lg">Contacto</h2>
      <p>
        <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a><br />
        {LEGAL_OPERATOR_ES}<br />
        {LEGAL_ADDRESS}
      </p>
    </LegalPage>
  );
}
