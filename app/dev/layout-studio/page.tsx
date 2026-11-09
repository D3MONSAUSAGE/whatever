import { notFound } from "next/navigation";
import { LayoutStudio } from "@/components/layout-studio";

export default function LayoutStudioPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LayoutStudio />;
}
