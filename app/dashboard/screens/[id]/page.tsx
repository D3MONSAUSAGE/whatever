"use client";
import { useParams } from "next/navigation";
import { ScreenWorkspace } from "@/components/my-screens";

export default function ScreenPage() {
  const params = useParams<{ id: string }>();
  return <ScreenWorkspace id={params.id} />;
}
