import { notFound } from "next/navigation";
import { LayoutStudio } from "@/components/layout-studio";
import { layoutStudioEnabled } from "@/lib/layout-studio";
import { isUuid } from "@/lib/server/crypto";

/** Signed-in studio. The public /layout-studio demo stays closed in production. */
export default async function AccountLayoutStudioPage({ searchParams }: { searchParams: Promise<{ screen?: string }> }) {
  if (!layoutStudioEnabled()) notFound();
  const { screen } = await searchParams;
  const screenId = typeof screen === "string" && isUuid(screen) ? screen : null;
  return <LayoutStudio mode="account" screenId={screenId} />;
}
