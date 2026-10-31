import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://pantalla-chi.vercel.app"),
  title: "Pekko",
  description: "Pekko Technologies. Making life simpler every day.",
  applicationName: "Pekko",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: { url: "/brand/apple-touch-icon.png", sizes: "180x180" },
  },
  openGraph: { title: "Pekko", description: "Pekko Technologies. Making life simpler every day.", siteName: "Pekko", type: "website" },
  twitter: { card: "summary_large_image", title: "Pekko", description: "Pekko Technologies. Making life simpler every day." },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0066FF" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
