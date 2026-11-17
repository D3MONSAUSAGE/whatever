import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { html, legalPageSnapshot } from "./helpers/legal-markup";

// Francisco t58u: disclose Firebase push tokens and installation IDs in the Privacy Policy, EN and ES.
let cookieLocale: string | undefined;
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === "pekko_locale" && cookieLocale ? { value: cookieLocale } : undefined) }) }));
const { default: Privacy } = await import("@/app/privacy/page");
type Page = (p: { searchParams: Promise<Record<string, string>> }) => Promise<ReactElement>;
const page = (q: Record<string, string>) => (Privacy as unknown as Page)({ searchParams: Promise.resolve(q) });
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
function unwrap(input: ReactElement) {
  let el = input;
  while (typeof el.type === "function" && (el.type as { name: string }).name !== "LegalPage") el = (el.type as (p: unknown) => ReactElement)(el.props);
  return legalPageSnapshot(el);
}

describe("Privacy: Firebase push token and installation ID", () => {
  it("EN discloses the token, the FID shared with Google and not stored by Pekko, FCM's inputs, and the Settings switch", async () => {
    const snap = unwrap(await page({}));
    const t = text(snap.html);
    expect(t).toContain("Mobile push. If you use the Pekko app and the device allows notifications, a push token for that device. To deliver notifications, Google's Firebase software in the app also creates a Firebase installation ID on the device and shares it with Google; Pekko does not store or use that ID.");
    expect(t).toContain("It receives the push token, the Firebase installation ID and the notification content.");
    expect(t).toContain("Allow or refuse mobile notifications on the device, or turn push alerts off in Pekko Settings. A push token is stored only when notifications are used.");
    expect(snap.dateLine).toBe("Effective November 17, 2026. Last updated November 17, 2026.");
  });
  it("ES has the same three disclosures (usted) and the current privacy date", async () => {
    cookieLocale = "es";
    const snap = unwrap(await page({}));
    cookieLocale = undefined;
    const t = text(snap.html);
    expect(t).toContain("el software Firebase de Google incluido en la app también crea un ID de instalación de Firebase en el dispositivo y lo comparte con Google; Pekko no almacena ni usa ese ID.");
    expect(t).toContain("Recibe el token push, el ID de instalación de Firebase y el contenido de la notificación.");
    expect(t).toContain("o desactive las alertas push en Configuración de Pekko.");
    expect(JSON.stringify(snap)).toContain("17 de noviembre de 2026");
    expect(t).not.toMatch(/\b(tú|puedes|desactiva)\b/);
    void html;
  });
});
