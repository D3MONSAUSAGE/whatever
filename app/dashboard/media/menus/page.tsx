import { MenuBoards } from "@/components/menu-boards";
import { layoutStudioEnabled } from "@/lib/layout-studio";

export default function MenusPage() {
  return <MenuBoards studioHref={layoutStudioEnabled() ? "/dashboard/media/layout-studio" : null} />;
}
