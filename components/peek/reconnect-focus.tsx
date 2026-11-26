"use client";
import { useEffect } from "react";

/**
 * My Screens "Reconnect" links to /dashboard/screens/{id}#reconnect (05-ROUTES AC). On arrival this opens the
 * existing ReconnectTv card and focuses its code input. Focus only: the ReconnectTv flow itself is unchanged.
 */
export function PeekReconnectFocus() {
  useEffect(() => {
    if (window.location.hash !== "#reconnect") return;
    let tries = 0;
    const timer = window.setInterval(() => {
      const card = document.querySelector<HTMLDetailsElement>('[data-testid="reconnect-tv"]');
      const input = card?.querySelector<HTMLInputElement>("input");
      if (card && input) {
        card.open = true;
        card.scrollIntoView({ block: "center" });
        input.focus({ preventScroll: true });
        window.clearInterval(timer);
      } else if (++tries > 40) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);
  return null;
}
