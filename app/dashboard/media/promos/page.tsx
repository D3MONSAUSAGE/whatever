"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PromoSlides } from "@/components/promo-slides";

export default function PromosPage() {
  return (
    <Suspense fallback={null}>
      <PromosFromSearch />
    </Suspense>
  );
}

function PromosFromSearch() {
  const search = useSearchParams();
  return <PromoSlides openNew={search.get("new") === "1"} openPromoId={search.get("promo")} />;
}
