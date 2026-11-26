import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SignupAttribution } from "@/components/signup-attribution";
import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
import { publicAppOrigin } from "@/lib/public-url";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  // Canonical/OG URLs are always on the customer domain (never a *.vercel.app host); see lib/public-url.ts.
  metadataBase: new URL(publicAppOrigin()),
  title: "Pekko",
  description: "Pekko. Digital signage made simple.",
  applicationName: "Pekko",
  icons: {
    // Stable, publicly crawlable 96x96 PNG first so Google Search can pick it up.
    icon: [
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: { url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  openGraph: { title: "Pekko", description: "Pekko. Digital signage made simple.", siteName: "Pekko", type: "website" },
  twitter: { card: "summary_large_image", title: "Pekko", description: "Pekko. Digital signage made simple." },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0066FF" };

/**
 * I18N-1: the pekko_locale cookie picks the language (English when unset), so pages render per request.
 * Switching language only changes React context + the cookie; nothing remounts, so drafts survive.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        <LocaleProvider initial={locale}><SignupAttribution />{children}</LocaleProvider>
      </body>
    </html>
  );
}
