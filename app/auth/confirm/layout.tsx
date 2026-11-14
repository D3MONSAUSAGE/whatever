import type { Metadata } from "next";

// B2-07A: the email link's token_hash must never leave this page as a Referer
// (also set as a Referrer-Policy header for /auth/* in next.config.ts).
export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false, follow: false } };

export default function AuthConfirmLayout({ children }: { children: React.ReactNode }) {
  return children;
}
