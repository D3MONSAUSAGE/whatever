import type { Metadata } from "next";

/** SEO: account pages stay out of search results; links on them can still be followed. */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
