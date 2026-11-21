import type { Locale } from "@/lib/server/locale";

export type BillingWarning = { kind: string; message: string; action: string | null };
export type PaymentMethodSummary = { brand: string; last4: string };

function cardLabel(pm: PaymentMethodSummary | null | undefined): string {
  if (!pm?.brand && !pm?.last4) return "";
  const brand = (pm.brand || "card").trim();
  const last4 = (pm.last4 || "").trim();
  if (brand && last4) return ` (${brand} •••• ${last4})`;
  if (last4) return ` (•••• ${last4})`;
  return ` (${brand})`;
}

function trialLeftLead(n: number, locale: Locale): string {
  if (locale === "es") return n === 1 ? "Queda 1 día de prueba gratis" : `Quedan ${n} días de prueba gratis`;
  return n === 1 ? "1 day left in your free trial" : `${n} days left in your free trial`;
}

function daysWord(n: number, locale: Locale): string {
  if (locale === "es") return n === 1 ? "1 día" : `${n} días`;
  return n === 1 ? "1 day" : `${n} days`;
}

/** Localized subscription warning / status_detail copy. Android Play builds may rewrite these (status-only). */
export function billingWarningCopy(
  kind: string,
  locale: Locale,
  opts: {
    daysLeft?: number;
    date?: string;
    paymentMethod?: PaymentMethodSummary | null;
    planName?: string;
    screenLimit?: number;
    activeScreens?: number;
  } = {},
): BillingWarning {
  const date = opts.date || "";
  const days = typeof opts.daysLeft === "number" ? opts.daysLeft : 0;
  const pm = opts.paymentMethod ?? null;
  const plan = opts.planName || "";
  const es = locale === "es";
  const card = cardLabel(pm);
  const screens = opts.screenLimit ?? 0;
  const active = opts.activeScreens ?? 0;

  if (kind === "trial_ending" && pm) {
    return {
      kind,
      action: "open_plan",
      message: es
        ? `${trialLeftLead(days, "es")}, hasta el ${date}. Su método de pago${card} está guardado; la facturación comienza cuando termine la prueba.`
        : `${trialLeftLead(days, "en")}, ending ${date}. Your payment method${card} is on file; billing starts when the trial ends.`,
    };
  }
  if (kind === "trial_ending") {
    return {
      kind,
      action: "open_plan",
      message: es
        ? `${trialLeftLead(days, "es")}, hasta el ${date}. Agregue un método de pago para mantener sus pantallas activas.`
        : `${trialLeftLead(days, "en")}, ending ${date}. Add a payment method to keep your screens on.`,
    };
  }
  if (kind === "trial_ended") {
    return {
      kind,
      action: "open_plan",
      message: es
        ? (date
          ? `Su prueba gratis terminó. Las pantallas siguen activas hasta el ${date}, pero la edición y la publicación están bloqueadas. Elija un plan para mantenerlas encendidas.`
          : "Su prueba gratis terminó. Elija un plan para mantener sus pantallas encendidas.")
        : (date
          ? `Your free trial has ended. Screens keep playing until ${date}, but editing and publishing are locked. Choose a plan to keep them on.`
          : "Your free trial has ended. Choose a plan to keep your screens on."),
    };
  }
  if (kind === "expired") {
    return {
      kind,
      action: "open_plan",
      message: es
        ? "Su prueba gratis terminó, así que sus pantallas están en pausa. Su contenido y ajustes se conservan. Elija un plan para volver a activarlas."
        : "Your free trial has ended, so your screens are paused. Your content and settings are saved. Choose a plan to turn them back on.",
    };
  }
  if (kind === "canceled") {
    return {
      kind,
      action: "open_plan",
      message: es
        ? "Su plan no está activo, así que sus pantallas están en pausa. Su contenido y ajustes se conservan. Elija un plan para volver a activarlas."
        : "Your plan isn't active, so your screens are paused. Your content and settings are saved. Choose a plan to turn them back on.",
    };
  }
  if (kind === "payment_failed") {
    return {
      kind,
      action: "open_plan",
      message: es
        ? (date
          ? (days === 1 || days === 2
            ? `El período de gracia del pago termina en ${daysWord(days, "es")}, el ${date}. Actualice su método de pago para que las pantallas sigan activas. Su contenido no se elimina.`
            : `No pudimos procesar su último pago. Actualice su método de pago antes del ${date} para que las pantallas sigan activas.`)
          : "No pudimos procesar su último pago. Actualice su método de pago para que las pantallas sigan activas.")
        : (date
          ? (days === 1 || days === 2
            ? `Your payment grace ends in ${daysWord(days, "en")}, on ${date}. Update your payment method to keep your screens playing. Your content is not deleted.`
            : `We couldn't take your last payment. Update your payment method before ${date} to keep your screens playing.`)
          : "We couldn't take your last payment. Update your payment method to keep your screens playing."),
    };
  }
  if (kind === "over_limit") {
    return {
      kind,
      action: "select_screens",
      message: es
        ? `Su plan incluye ${screens} pantalla${screens === 1 ? "" : "s"}, pero hay ${active} activas. Elija cuáles se quedan encendidas; las demás se pausan y no se elimina nada.`
        : `Your plan includes ${screens} screen${screens === 1 ? "" : "s"} but ${active} are on. Choose which screens stay on; the others pause and nothing is deleted.`,
    };
  }
  if (kind === "trialing") {
    return {
      kind,
      action: null,
      message: es
        ? `Está en un período de prueba. Su método de pago${card} está guardado; la facturación comienza el ${date}.`
        : `You're on a trial. Your payment method${card} is on file; billing starts on ${date}.`,
    };
  }
  if (kind === "active") {
    return {
      kind,
      action: null,
      message: es
        ? (date ? `Su plan está activo. El próximo cobro es el ${date}.` : "Su plan está activo.")
        : (date ? `Your plan is active. The next charge is on ${date}.` : "Your plan is active."),
    };
  }
  if (kind === "canceling") {
    return {
      kind,
      action: null,
      message: es
        ? `Su plan sigue activo hasta el ${date}, luego se cancela.`
        : `Your plan stays active until ${date}, then it cancels.`,
    };
  }
  if (kind === "complimentary") {
    return {
      kind,
      action: null,
      message: es
        ? (plan ? `Cuenta de cortesía (${plan}). No se cobra.` : "Cuenta de cortesía. No se cobra.")
        : (plan ? `Complimentary account (${plan}). You are not charged.` : "Complimentary account. You are not charged."),
    };
  }
  if (kind === "checkout_pending") {
    return {
      kind,
      action: "open_plan",
      message: es
        ? (plan
          ? `Tiene un pago de ${plan} sin terminar, válido hasta el ${date}. No se ha cobrado nada.`
          : `Tiene un pago sin terminar, válido hasta el ${date}. No se ha cobrado nada.`)
        : (plan
          ? `You have an unfinished ${plan} checkout, open until ${date}. Nothing has been charged.`
          : `You have an unfinished checkout, open until ${date}. Nothing has been charged.`),
    };
  }
  return { kind, action: null, message: es ? "Revise el estado de su cuenta." : "Review your account status." };
}

export function paidPlanLabel(plan: string, locale: Locale): string {
  if (plan === "starter") return "Starter";
  if (plan === "business") return "Business";
  if (plan === "multi") return locale === "es" ? "Multi-pantalla" : "Multi-screen";
  return plan;
}

export function checkoutSubmitMessage(input: {
  deferred: boolean;
  price: number;
  chargeDate: string;
  locale?: Locale;
}): string {
  const es = input.locale === "es";
  const amount = `$${input.price}`;
  if (input.deferred) {
    return es
      ? `Se le cobrará ${amount} el ${input.chargeDate}. Luego la suscripción se renueva cada mes hasta que la cancele. Cancele antes de esa fecha para evitar el primer cobro. Esto no extiende su prueba.`
      : `You will be charged ${amount} on ${input.chargeDate}. The subscription then renews monthly until you cancel. Cancel before that date to avoid the first charge. This does not extend your trial.`;
  }
  return es
    ? `Se le cobrará ${amount} hoy, y luego cada mes hasta que cancele. Los días de prueba no usados no se acreditan.`
    : `You will be charged ${amount} today, then monthly until you cancel. Unused trial days are not credited.`;
}
