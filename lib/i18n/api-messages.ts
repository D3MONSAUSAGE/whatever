/**
 * I18N-2: Spanish for API error text that has no specific `apiError.*` code (generic codes such as
 * validation_failed or not_found). Keyed by the exact English message the route sends; the `code` in the
 * response never changes, and English callers get the original text. `{name}` placeholders match any text.
 * Developer-facing messages (field names, cron, player protocol) and billing wording stay English.
 */
export const API_MESSAGES_ES: Readonly<Record<string, string>> = {
  // Screens, pairing, groups
  "A group with that name already exists.": "Ya existe un grupo con ese nombre.",
  "Choose horizontal or vertical.": "Elija horizontal o vertical.",
  "Screen orientation isn't available yet. Try again after the next update.": "La orientación de la pantalla aún no está disponible. Intente de nuevo después de la próxima actualización.",
  "Couldn't update the screen. Try again.": "No se pudo actualizar la pantalla. Intente de nuevo.",
  "Choose at least one TV.": "Elija al menos una TV.",
  "Choose at least one screen.": "Elija al menos una pantalla.",
  "Choose fewer screens. Fifty is the limit for one publish.": "Elija menos pantallas. El límite es de cincuenta por publicación.",
  "Choose a screen or a screen group, not both.": "Elija una pantalla o un grupo de pantallas, no ambos.",
  "Choose a screen or a screen group.": "Elija una pantalla o un grupo de pantallas.",
  "Choose screens from this account.": "Elija pantallas de esta cuenta.",
  "Choose the screens to keep on.": "Elija las pantallas que quiere mantener encendidas.",
  "Couldn't add the group.": "No se pudo agregar el grupo.",
  "Couldn't create a pairing code.": "No se pudo crear un código de vinculación.",
  "Couldn't delete the group.": "No se pudo eliminar el grupo.",
  "Couldn't disconnect. Try again.": "No se pudo desvincular. Intente de nuevo.",
  "Couldn't load displays.": "No se pudieron cargar las pantallas.",
  "Couldn't load screen groups.": "No se pudieron cargar los grupos de pantallas.",
  "Couldn't load screen state.": "No se pudo cargar el estado de la pantalla.",
  "Couldn't load screens.": "No se pudieron cargar las pantallas.",
  "Couldn't load your screens.": "No se pudieron cargar sus pantallas.",
  "Couldn't load that screen.": "No se pudo cargar esa pantalla.",
  "Couldn't move the screen. Try again.": "No se pudo mover la pantalla. Intente de nuevo.",
  "Couldn't rename. Try again.": "No se pudo cambiar el nombre. Intente de nuevo.",
  "Couldn't send the command.": "No se pudo enviar el comando.",
  "Couldn't unpair this TV. Try again.": "No se pudo desvincular esta TV. Intente de nuevo.",
  "Couldn't update the group.": "No se pudo actualizar el grupo.",
  "Display not found.": "No se encontró la pantalla.",
  "Display or image not found.": "No se encontró la pantalla o la imagen.",
  "Enter a display name.": "Escriba un nombre para la pantalla.",
  "Give this group a name.": "Ponga un nombre a este grupo.",
  "Name can't be empty.": "El nombre no puede estar vacío.",
  "One of those screens isn't in this account.": "Una de esas pantallas no está en esta cuenta.",
  "One of those screens isn't in this group.": "Una de esas pantallas no está en este grupo.",
  "One of those screens wasn't found.": "No se encontró una de esas pantallas.",
  "Remote control is not available yet.": "El control remoto todavía no está disponible.",
  "Screen group not found.": "No se encontró el grupo de pantallas.",
  "Screen has no published playlist assigned.": "La pantalla no tiene asignada una lista de reproducción publicada.",
  "Screen not found.": "No se encontró la pantalla.",
  "That board or screen isn't in this account.": "Ese menú o esa pantalla no está en esta cuenta.",
  "This account already has 100 screen groups.": "Esta cuenta ya tiene 100 grupos de pantallas.",
  "Too many pairing requests. Try again later.": "Demasiadas solicitudes de vinculación. Intente de nuevo más tarde.",
  "You don't have access to that screen.": "No tiene acceso a esa pantalla.",
  "{name}: {error}": "{name}: {error}",

  // Locations
  "Couldn't add the location.": "No se pudo agregar la ubicación.",
  "Couldn't delete the location.": "No se pudo eliminar la ubicación.",
  "Couldn't load locations.": "No se pudieron cargar las ubicaciones.",
  "Couldn't update the location.": "No se pudo actualizar la ubicación.",
  "Give this location a name.": "Ponga un nombre a esta ubicación.",
  "Location not found.": "No se encontró la ubicación.",
  "That location still has screens. Move them first.": "Esa ubicación todavía tiene pantallas. Muévalas primero.",
  "That timezone isn't an IANA name like America/Los_Angeles.": "Esa zona horaria no es un nombre IANA como America/Los_Angeles.",
  "This account already has 50 locations.": "Esta cuenta ya tiene 50 ubicaciones.",

  // Media, uploads, presentations
  "Choose a photo from your library.": "Elija una foto de su biblioteca.",
  "Choose a photo from your media.": "Elija una foto de sus archivos.",
  "Choose a video from your library.": "Elija un video de su biblioteca.",
  "Choose a logo from your media.": "Elija un logotipo de sus archivos.",
  "Couldn't add that presentation.": "No se pudo agregar esa presentación.",
  "Couldn't check that image.": "No se pudo revisar esa imagen.",
  "Couldn't check your media library.": "No se pudo revisar su biblioteca de archivos.",
  "Couldn't delete. Try again.": "No se pudo eliminar. Intente de nuevo.",
  "Couldn't load images.": "No se pudieron cargar las imágenes.",
  "Couldn't load that presentation.": "No se pudo cargar esa presentación.",
  "Couldn't load your media library.": "No se pudo cargar su biblioteca de archivos.",
  "Couldn't rename that file. Try again.": "No se pudo cambiar el nombre de ese archivo. Intente de nuevo.",
  "Couldn't save. Try again.": "No se pudo guardar. Intente de nuevo.",
  "Couldn't save that presentation. Try again.": "No se pudo guardar esa presentación. Intente de nuevo.",
  "Couldn't save that video. Try again.": "No se pudo guardar ese video. Intente de nuevo.",
  "Couldn't start the upload. Try again.": "No se pudo iniciar la subida. Intente de nuevo.",
  "Couldn't update that presentation.": "No se pudo actualizar esa presentación.",
  "File not found.": "No se encontró el archivo.",
  "Give the file a name.": "Ponga un nombre al archivo.",
  "Give the presentation a name.": "Ponga un nombre a la presentación.",
  "Image not found.": "No se encontró la imagen.",
  "Presentation not found.": "No se encontró la presentación.",
  "Rename presentations with their own Rename button.": "Cambie el nombre de las presentaciones con su propio botón Cambiar nombre.",
  "That presentation is not ready yet.": "Esa presentación todavía no está lista.",
  "That slide is no longer in this presentation.": "Esa diapositiva ya no está en esta presentación.",
  "Upload a JPG, PNG, or WebP image.": "Suba una imagen JPG, PNG o WebP.",
  "Upload didn't arrive. Try again.": "La subida no llegó. Intente de nuevo.",
  "Upload failed. Try again.": "La subida falló. Intente de nuevo.",

  // Playlists, publishing
  "A playlist holds up to 40 items.": "Una lista de reproducción admite hasta 40 elementos.",
  "Add at least one image, then choose TVs from this account.": "Agregue al menos una imagen y luego elija TV de esta cuenta.",
  "Add at least one image, then choose screens from this account.": "Agregue al menos una imagen y luego elija pantallas de esta cuenta.",
  "Add at least one slide, then publish the slides.": "Agregue al menos una diapositiva y luego publique las diapositivas.",
  "Check the slide times and try again.": "Revise los tiempos de las diapositivas e intente de nuevo.",
  "Check the slides and try again.": "Revise las diapositivas e intente de nuevo.",
  "Choose Automatic or Manual slideshow.": "Elija presentación de diapositivas Automática o Manual.",
  "Choose a playlist.": "Elija una lista de reproducción.",
  "Choose a transition.": "Elija una transición.",
  "Choose draft or publish.": "Elija borrador o publicar.",
  "Couldn't change playback mode.": "No se pudo cambiar el modo de reproducción.",
  "Couldn't create a playlist from that presentation.": "No se pudo crear una lista de reproducción a partir de esa presentación.",
  "Couldn't create a playlist from that presentation. Check it still has slides.": "No se pudo crear una lista de reproducción a partir de esa presentación. Revise que todavía tenga diapositivas.",
  "Couldn't create the playlist.": "No se pudo crear la lista de reproducción.",
  "Couldn't delete the playlist.": "No se pudo eliminar la lista de reproducción.",
  "Couldn't load playlists.": "No se pudieron cargar las listas de reproducción.",
  "Couldn't load the playlist.": "No se pudo cargar la lista de reproducción.",
  "Couldn't preview that publish.": "No se pudo mostrar la vista previa de esa publicación.",
  "Couldn't publish the playlist.": "No se pudo publicar la lista de reproducción.",
  "Couldn't publish the slides.": "No se pudieron publicar las diapositivas.",
  "Couldn't publish. Try again.": "No se pudo publicar. Intente de nuevo.",
  "Couldn't save the playlist.": "No se pudo guardar la lista de reproducción.",
  "Couldn't save the playlist. Check that the images are still in your library.": "No se pudo guardar la lista de reproducción. Revise que las imágenes sigan en su biblioteca.",
  "Default duration must be between 1 and 600 seconds.": "La duración predeterminada debe ser de 1 a 600 segundos.",
  "Default duration must be between 3 and 3600 seconds.": "La duración predeterminada debe ser de 3 a 3600 segundos.",
  "Each slide must be between 3 and 3600 seconds, or cleared to use the default.": "Cada diapositiva debe durar de 3 a 3600 segundos, o dejarse en blanco para usar la duración predeterminada.",
  "Give the playlist a name.": "Ponga un nombre a la lista de reproducción.",
  "Playlist not found.": "No se encontró la lista de reproducción.",
  "Publish a video from a playlist. A single screen assignment has to be an image.": "Publique un video desde una lista de reproducción. Una asignación directa a una pantalla tiene que ser una imagen.",
  "Set a default duration in seconds.": "Defina una duración predeterminada en segundos.",

  // Menu boards, layouts
  "A board can play one video.": "Un menú digital puede reproducir un solo video.",
  "Add a title or at least one item.": "Agregue un título o al menos un producto.",
  "Add your menu items.": "Agregue los productos de su menú.",
  "Check the feature text.": "Revise el texto destacado.",
  "Check the title and footer.": "Revise el título y el pie de página.",
  "Check your items.": "Revise sus productos.",
  "Check your sections.": "Revise sus secciones.",
  "Choose a layout.": "Elija un diseño.",
  "Choose a template or layout from the catalog.": "Elija una plantilla o un diseño del catálogo.",
  "Choose one of this template's colour styles.": "Elija uno de los estilos de color de esta plantilla.",
  "Couldn't assign that board.": "No se pudo asignar ese menú digital.",
  "Couldn't build the preview.": "No se pudo crear la vista previa.",
  "Couldn't confirm this board belongs to the signed-in account. It was not saved.": "No se pudo confirmar que este menú digital pertenece a la cuenta con la sesión iniciada. No se guardó.",
  "Couldn't create the menu image. Try again.": "No se pudo crear la imagen del menú. Intente de nuevo.",
  "Couldn't create the menu.": "No se pudo crear el menú.",
  "Couldn't delete the menu.": "No se pudo eliminar el menú.",
  "Couldn't load boards.": "No se pudieron cargar los menús digitales.",
  "Couldn't load menus.": "No se pudieron cargar los menús.",
  "Couldn't load the menu.": "No se pudo cargar el menú.",
  "This file is used by {name}. Remove it there, then delete it.": "Este archivo se usa en {name}. Quítelo de ahí y luego elimínelo.",
  "This file is your Brand Kit logo. Choose another logo, then delete it.": "Este archivo es el logotipo de su Kit de marca. Elija otro logotipo y luego elimínelo.",
  "This file is your Brand Kit logo and is used by {name}. Remove it there, then delete it.": "Este archivo es el logotipo de su Kit de marca y se usa en {name}. Quítelo de ahí y luego elimínelo.",
  "Couldn't load this board's screens. Try again.": "No se pudieron cargar las pantallas de este menú. Intente de nuevo.",
  "Couldn't load your menus.": "No se pudieron cargar sus menús.",
  "Couldn't open that menu.": "No se pudo abrir ese menú.",
  "Couldn't update the menu.": "No se pudo actualizar el menú.",
  "This menu board was made in the web editor. Edit it at pekkotv.com.": "Este menú digital se creó en el editor web. Edítelo en pekkotv.com.",
  "1 item doesn't fit on the screen. Remove an item or choose a roomier template, then publish.": "1 producto no cabe en la pantalla. Quite un producto o elija una plantilla con más espacio y luego publique.",
  "{n} items don't fit on the screen. Remove some items or choose a roomier template, then publish.": "{n} productos no caben en la pantalla. Quite algunos productos o elija una plantilla con más espacio y luego publique.",
  "Your text or photo size changes don't fit on the screen. Use Return to safe size, then publish.": "Sus cambios de tamaño de texto o de foto no caben en la pantalla. Use Volver al tamaño seguro y luego publique.",
  "Check the look settings.": "Revise los ajustes de apariencia.",
  "Give the menu a name.": "Ponga un nombre al menú.",
  "Layout Studio is not on.": "Layout Studio no está activado.",
  "Menu not found.": "No se encontró el menú.",
  "Publish the board before assigning it to a screen.": "Publique el menú digital antes de asignarlo a una pantalla.",
  "Set three column widths that add up to the full board.": "Defina tres anchos de columna que sumen el ancho completo del menú.",
  "That draft belonged to another account. It was not saved. A new board is open instead.": "Ese borrador pertenecía a otra cuenta. No se guardó. En su lugar se abrió un menú nuevo.",
  "That isn't a layout board.": "Ese no es un diseño.",
  "That menu board was deleted or isn't in this account. Reload the page and pick again.": "Ese menú digital se eliminó o no está en esta cuenta. Recargue la página y elija de nuevo.",
  "That menu isn't in this account.": "Ese menú no está en esta cuenta.",
  "That proportion is outside this layout.": "Esa proporción está fuera de este diseño.",
  "This layout version is not supported.": "Esta versión del diseño no es compatible.",
  "This account already has {n} menus.": "Esta cuenta ya tiene {n} menús.",

  // Promotions
  "Add a headline.": "Agregue un titular.",
  "Couldn't add the promo to the menu.": "No se pudo agregar la promoción al menú.",
  "Couldn't add the promo.": "No se pudo agregar la promoción.",
  "Couldn't create the promo image. Try again.": "No se pudo crear la imagen de la promoción. Intente de nuevo.",
  "Couldn't create the promo.": "No se pudo crear la promoción.",
  "Couldn't delete the promo.": "No se pudo eliminar la promoción.",
  "Couldn't load promos.": "No se pudieron cargar las promociones.",
  "Couldn't load the promo.": "No se pudo cargar la promoción.",
  "Couldn't load your promos.": "No se pudieron cargar sus promociones.",
  "Couldn't move the promo's dates.": "No se pudieron mover las fechas de la promoción.",
  "Couldn't move the promo.": "No se pudo mover la promoción.",
  "Couldn't save the dates.": "No se pudieron guardar las fechas.",
  "Couldn't schedule the promo.": "No se pudo programar la promoción.",
  "Couldn't take the promo off its menu.": "No se pudo quitar la promoción de su menú.",
  "Couldn't take the promo off the menu. If it's the only slide left, add something else first.": "No se pudo quitar la promoción del menú. Si es la única diapositiva que queda, agregue algo más primero.",
  "Couldn't update the promo.": "No se pudo actualizar la promoción.",
  "Give the promo a name.": "Ponga un nombre a la promoción.",
  "Keep at least one date, or take the promo off the menu and add it again without dates.": "Conserve al menos una fecha, o quite la promoción del menú y agréguela de nuevo sin fechas.",
  "Promo not found.": "No se encontró la promoción.",
  "Save the promo first.": "Guarde la promoción primero.",
  "The end date is before the start date.": "La fecha de fin es anterior a la fecha de inicio.",
  "This promo is always on its menu. Take it off the menu, set the dates, then add it again.": "Esta promoción siempre está en su menú. Quítela del menú, defina las fechas y agréguela de nuevo.",
  "Use dates like 2026-11-01, or leave them blank.": "Use fechas como 2026-11-01, o déjelas en blanco.",
  "This account already has {n} promos.": "Esta cuenta ya tiene {n} promociones.",

  // Schedules
  "Check each part of the day.": "Revise cada franja horaria.",
  "Couldn't add the schedule.": "No se pudo agregar el horario.",
  "Couldn't delete the schedule.": "No se pudo eliminar el horario.",
  "Couldn't load schedules.": "No se pudieron cargar los horarios.",
  "Couldn't load the upcoming schedule.": "No se pudo cargar el próximo horario.",
  "Couldn't save the schedule.": "No se pudo guardar el horario.",
  "Couldn't update the schedule.": "No se pudo actualizar el horario.",
  "Give this schedule a name.": "Ponga un nombre a este horario.",
  "Pick at least one weekday.": "Elija al menos un día de la semana.",
  "Preview covers 1 to 14 days.": "La vista previa cubre de 1 a 14 días.",
  "Priority has to be a whole number from -1000 to 1000.": "La prioridad tiene que ser un número entero de -1000 a 1000.",
  "Publish that playlist before scheduling it. Screens play its published slides, and publishing slides does not have to assign the playlist as the everyday default.": "Publique esa lista de reproducción antes de agregarla a un horario. Las pantallas reproducen sus diapositivas publicadas, y publicar diapositivas no tiene que asignar la lista como la opción de todos los días.",
  "Schedule not found.": "No se encontró el horario.",
  "The start and end are the same. A window has to cover some time.": "El inicio y el fin son iguales. Una franja horaria tiene que cubrir algo de tiempo.",
  "This account already has 200 schedules.": "Esta cuenta ya tiene 200 horarios.",
  "Use times like 11:00 and 14:00. 24:00 means midnight at the end of the day.": "Use horas como 11:00 y 14:00. 24:00 significa la medianoche al final del día.",
  "Add 1 to {n} parts of the day.": "Agregue de 1 a {n} franjas horarias.",
  "“{name}” hasn't been published yet. Publish this board first, then schedule it.": "“{name}” todavía no se ha publicado. Publique primero este menú digital y luego agréguelo a un horario.",

  // Brand Kit
  "Change at least one brand field.": "Cambie al menos un campo de la marca.",
  "Choose colours like #0066ff.": "Elija colores como #0066ff.",
  "Couldn't load your brand.": "No se pudo cargar su marca.",
  "Couldn't save your brand.": "No se pudo guardar su marca.",
  "Enter a website as http:// or https://.": "Escriba un sitio web que empiece con http:// o https://.",
  "Send your brand as JSON.": "Envíe su marca como JSON.",
  "That phone number has too many digits (15 at most).": "Ese número de teléfono tiene demasiados dígitos (15 como máximo).",
  "That phone number is too short. Include the area code, like (555) 010-0199.": "Ese número de teléfono es demasiado corto. Incluya la lada o código de área, por ejemplo (555) 010-0199.",
  "Use a color like #0066ff.": "Use un color como #0066ff.",
  "Use a color like #112233.": "Use un color como #112233.",
  "Use a color like #f6f9fe.": "Use un color como #f6f9fe.",
  "Use a color like #ffd34d.": "Use un color como #ffd34d.",
  "Use my brand has to be on or off.": "Usar mi marca tiene que estar activado o desactivado.",

  // Account, setup, alerts, devices, analytics
  "Choose 7 to 14 days.": "Elija de 7 a 14 días.",
  "Couldn't cancel. Try again.": "No se pudo cancelar. Intente de nuevo.",
  "Couldn't load analytics. Try again.": "No se pudieron cargar las estadísticas. Intente de nuevo.",
  "Couldn't load deletion status.": "No se pudo cargar el estado de la eliminación.",
  "Couldn't load the overview.": "No se pudo cargar el resumen.",
  "Couldn't load your account.": "No se pudo cargar su cuenta.",
  "Couldn't load your setup progress.": "No se pudo cargar el progreso de la configuración.",
  "Couldn't remove this device.": "No se pudo quitar este dispositivo.",
  "Couldn't save this device.": "No se pudo guardar este dispositivo.",
  "Push notifications aren't set up on this server yet.": "Las notificaciones push todavía no están configuradas en este servidor.",
  "Couldn't send a test notification.": "No se pudo enviar una notificación de prueba.",
  "Send an empty JSON body {}.": "Envíe un cuerpo JSON vacío {}.",
  "scope must be 'global' or 'local'.": "scope debe ser 'global' o 'local'.",
  "Too many test notifications. Try again later.": "Demasiadas notificaciones de prueba. Intente de nuevo más tarde.",
  "Couldn't save your choice. Try again.": "No se pudo guardar su elección. Intente de nuevo.",
  "Couldn't schedule deletion. Try again.": "No se pudo programar la eliminación. Intente de nuevo.",
  "A test email was just sent. Wait 10 minutes before sending another.": "Se acaba de enviar un correo de prueba. Espere 10 minutos antes de enviar otro.",
  "Nothing to update.": "No hay nada que actualizar.",
  "Only the account owner can delete this account.": "Solo el propietario de la cuenta puede eliminarla.",
  "Only the account owner can manage billing.": "Solo el propietario de la cuenta puede administrar la facturación.",
  "Only the account owner can change the plan.": "Solo el propietario de la cuenta puede cambiar el plan.",
  "Choose a plan.": "Elija un plan.",
  "Use Manage billing to change this plan.": "Use Administrar facturación para cambiar este plan.",
  "Checkout isn't available yet.": "Checkout todavía no está disponible.",
  "Billing isn't available yet.": "La facturación todavía no está disponible.",
  "Setup progress isn't available yet.": "El progreso de la configuración todavía no está disponible.",
  "Couldn't update checkout. Try again.": "No se pudo actualizar el pago. Intente de nuevo.",
  "Self-service deletion isn't switched on yet. Contact support to delete your account.": "La eliminación por su cuenta todavía no está activada. Contacte a soporte para eliminar su cuenta.",
  "That password isn't right.": "Esa contraseña no es correcta.",
  "This account has no email.": "Esta cuenta no tiene correo electrónico.",
  "Type DELETE to confirm.": "Escriba DELETE para confirmar.",
  "Not found.": "No se encontró.",
  // DA-1 developer analytics
  "Too many requests. Wait a minute, then try again.": "Demasiadas solicitudes. Espere un minuto y vuelva a intentarlo.",
  "Choose a valid date range (up to 366 days, not in the future).": "Elija un rango de fechas válido (hasta 366 días, sin fechas futuras).",
  "Couldn't load analytics.": "No se pudieron cargar las estadísticas.",
  // DA-2 developer customer accounts
  "Couldn't load accounts.": "No se pudieron cargar las cuentas.",
  "Send a valid request.": "Envíe una solicitud válida.",
  "Not found": "No se encontró.",
  "Unauthorized.": "No autorizado.",
  "This month's video conversion budget is fully reserved. Export the video as H.264 (Most Compatible), or try again next month.": "El presupuesto de conversión de video de este mes ya está reservado. Expórtelo como H.264 (Más compatible) o vuelva a intentarlo el mes siguiente.",
  "Couldn't start video conversion. Try again, or export the video as H.264 (Most Compatible).": "No se pudo iniciar la conversión de video. Vuelva a intentarlo o expórtelo como H.264 (Más compatible).",
  "That video is still being converted, or conversion failed. Wait until it's ready, or pick a different video.": "Ese video todavía se está convirtiendo, o la conversión falló. Espere a que esté listo o elija otro video.",
  "This playlist includes a video that is still being converted, or that failed conversion. Wait until it's ready, or remove it, then publish again.": "Esta lista incluye un video que todavía se está convirtiendo, o cuya conversión falló. Espere a que esté listo o quítelo, y luego publique de nuevo.",

  "Couldn't load the conversion budget.": "No se pudo cargar el presupuesto de conversión.",

};

type Pattern = { re: RegExp; names: string[]; es: string };
const PATTERNS: Pattern[] = Object.entries(API_MESSAGES_ES)
  .filter(([en]) => en.includes("{"))
  .map(([en, es]) => {
    const names: string[] = [];
    const source = en.split(/(\{[a-z]+\})/i).map((part) => {
      const m = /^\{([a-z]+)\}$/i.exec(part);
      if (m) { names.push(m[1]); return "([\\s\\S]+?)"; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
    return { re: new RegExp(`^${source}$`), names, es };
  });

/** Spanish text for an exact English API message (or a `{placeholder}` pattern); null when unknown. */
export function apiMessageEs(english: string): string | null {
  const exact = API_MESSAGES_ES[english];
  if (exact !== undefined && !english.includes("{")) return exact;
  for (const p of PATTERNS) {
    const m = p.re.exec(english);
    if (!m) continue;
    let out = p.es;
    let ok = true;
    p.names.forEach((name, i) => {
      // Nested messages (`{name}: {error}`) translate only when the inner message is known.
      const inner = name === "error" ? apiMessageEs(m[i + 1]) : m[i + 1];
      if (inner === null) ok = false;
      else out = out.split(`{${name}}`).join(inner);
    });
    if (ok) return out;
  }
  return null;
}
