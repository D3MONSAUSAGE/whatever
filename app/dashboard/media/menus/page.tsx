import { MenuBoards } from "@/components/menu-boards";
import { layoutStudioEnabled } from "@/lib/layout-studio";

export default async function MenusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <MenuBoards initialSearch={params} studioEnabled={layoutStudioEnabled()} />;
}
