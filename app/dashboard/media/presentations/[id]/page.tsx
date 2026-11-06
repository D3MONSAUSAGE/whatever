"use client";
import { useParams } from "next/navigation";
import { PresentationDetailView } from "@/components/presentation-detail";

export default function PresentationPage() {
  const params = useParams<{ id: string }>();
  return <PresentationDetailView id={params.id} />;
}
