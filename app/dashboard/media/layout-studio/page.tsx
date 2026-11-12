import { permanentRedirect } from "next/navigation";
import { layoutStudioRedirect } from "@/lib/menu-board-unify";

/** The signed-in Layout Studio route permanently moves to the unified Menu Board Creator. Isolated /layout-studio stays. */
export default async function AccountLayoutStudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  permanentRedirect(layoutStudioRedirect(params));
}
