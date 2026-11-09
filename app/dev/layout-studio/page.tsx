import { notFound } from "next/navigation";
import { LayoutStudio } from "@/components/layout-studio";
import { layoutStudioPreviewOpen } from "@/lib/layout-studio";

export default function LayoutStudioPage() {
  if (!layoutStudioPreviewOpen()) notFound();
  return <LayoutStudio />;
}
