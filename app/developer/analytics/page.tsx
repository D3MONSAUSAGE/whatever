import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Always answers HTTP 404, for everyone, like /developer/accounts (QA R17-F1). Pekko sessions are bearer tokens
 * in browser storage, so the server can't tell a developer from anyone else while rendering. The segment's
 * not-found.tsx mounts the console, which shows data only after /api/developer/analytics confirms a developer.
 */
export default function DeveloperAnalyticsPage(): never {
  notFound();
}
