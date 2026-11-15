"use client";
import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { currentLocale, onLocaleChange, useLocale } from "@/lib/i18n/client";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { useToast } from "@/components/toast";

type Me = { locale?: string; localeChosen?: boolean };

/**
 * Keeps the signed-in account's saved language (accounts.locale) and this browser in step.
 * - On load: a saved account choice wins (and refreshes the cookie). With no saved choice yet, the
 *   language picked before sign-up/sign-in is saved to the account once.
 * - On switch: saves to the account. If that fails the switch still applies on this device.
 * Mounted once in the dashboard shell. Renders nothing.
 */
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
      } else if (currentLocale() !== "en") {
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
