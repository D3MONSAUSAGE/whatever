import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * DA-2: always answers HTTP 404, for everyone (QA R17-F1). Pekko sessions are bearer tokens in browser
 * storage, so the server can't tell a developer from anyone else at render time. Every visitor gets the
 * same 404 status and "not found" page; the segment's not-found.tsx also mounts the client, which shows the
 * list only after /api/developer/accounts confirms an allowlisted developer.
 */
export default function DeveloperAccountsPage(): never {
  notFound();
}
