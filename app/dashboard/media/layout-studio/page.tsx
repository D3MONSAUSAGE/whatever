import { notFound } from "next/navigation";
import { LayoutStudio } from "@/components/layout-studio";
import { layoutStudioEnabled } from "@/lib/layout-studio";

/** Signed-in studio. The public /layout-studio demo stays closed in production. */
export default function AccountLayoutStudioPage() {
  if (!layoutStudioEnabled()) notFound();
  return <LayoutStudio mode="account" />;
}
