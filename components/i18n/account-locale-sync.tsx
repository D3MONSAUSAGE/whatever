"use client";
import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { currentLocale, onLocaleChange, useLocale } from "@/lib/i18n/client";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { useToast } from "@/components/toast";

type Me = { locale?: string; localeChosen?: boolean; newAccount?: boolean };

/**
 * Keeps the signed-in account's saved language (accounts.locale) and this browser in step.
 * - On load: a saved account choice wins (and refreshes the cookie). With no saved choice yet, the
 *   language picked before sign-up is saved to the account once, but only for a new account
 *   (newAccount from /api/me, I18N-1F-07). An older account stays unset; this device keeps its cookie.
 * - On switch: saves to the account. If that fails the switch still applies on this device.
 * Mounted once in the dashboard shell. Renders nothing.
 */
/** I18N-1F-07: adopt this device's language into the account only when none is saved and the account is new. */
export function shouldAdoptDeviceLocale(me: Me, device: Locale): boolean {
  return !me.localeChosen && me.newAccount === true && device !== "en";
}

export function AccountLocaleSync() {
  const { setLocale, t } = useLocale();
  const toast = useToast();
  const adopting = useRef<Locale | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    let live = true;
    api<Me>("/api/me").then((me) => {
      if (!live) return;
      const saved = me.localeChosen && isLocale(me.locale) ? me.locale : null;
      if (saved) {
        if (saved !== currentLocale()) { adopting.current = saved; setLocale(saved); }
      } else if (shouldAdoptDeviceLocale(me, currentLocale())) {
        void api("/api/me", { method: "PATCH", body: JSON.stringify({ locale: currentLocale() }) }).catch(() => undefined);
      }
    }).catch(() => undefined);
    return () => { live = false; };
  }, [setLocale]);

  useEffect(() => onLocaleChange((next) => {
    if (adopting.current === next) { adopting.current = null; return; }
    api("/api/me", { method: "PATCH", body: JSON.stringify({ locale: next }) })
      .then(() => toast.show(tRef.current("lang.saved")))
      .catch(() => toast.show(tRef.current("lang.saveFailed"), true));
  }), [toast]);

  return null;
}
