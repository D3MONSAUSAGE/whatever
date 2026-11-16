import type { Metadata } from "next";

// DA-1: developer-only pages. Never indexed; the data API returns 404 to everyone who isn't a developer.
export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false, follow: false } };

export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
  return children;
}
