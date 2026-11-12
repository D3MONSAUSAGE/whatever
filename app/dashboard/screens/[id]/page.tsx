"use client";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ScreenWorkspace } from "@/components/my-screens";

export default function ScreenPage() {
  return (
    <Suspense fallback={null}>
      <ScreenFromSearch />
    </Suspense>
  );
}

function ScreenFromSearch() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const raw = search.get("panel");
  const panel = raw === "change" || raw === "upload" || raw === "create" || raw === "playlist" || raw === "schedule" ? raw : null;
  return <ScreenWorkspace id={params.id} initialPanel={panel} />;
}
