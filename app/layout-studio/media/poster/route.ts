import { NextResponse } from "next/server";
import { layoutStudioPreviewOpen, sampleLayout } from "@/lib/layout-studio";
import { renderLayoutPng } from "@/lib/server/layout-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  if (!layoutStudioPreviewOpen()) return new NextResponse("Not found", { status: 404 });
  const png = renderLayoutPng({
    ...sampleLayout("menu-promo-67"),
    videoMediaId: "00000000-0000-4000-8000-000000000001",
  });
  return new NextResponse(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}
