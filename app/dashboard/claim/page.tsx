import { notFound } from "next/navigation";
import { guestEditorEnabled } from "@/lib/guest-editor-flag";
import { GuestClaimScreen } from "@/components/guest/guest-claim";

export const dynamic = "force-dynamic";

/** After sign-up or log-in from the guest editor: moves the menu into the account, then continues the action. */
export default async function ClaimPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!guestEditorEnabled()) notFound();
  const q = await searchParams;
  const intent = typeof q.intent === "string" ? q.intent : null;
  return <GuestClaimScreen intent={intent} />;
}
