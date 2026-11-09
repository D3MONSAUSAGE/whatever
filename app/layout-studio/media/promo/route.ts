import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { layoutStudioPreviewOpen } from "@/lib/layout-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  if (!layoutStudioPreviewOpen()) return new NextResponse("Not found", { status: 404 });
  const file = readFileSync(join(process.cwd(), "assets/layout-fixtures/promo.mp4"));
  return new NextResponse(new Uint8Array(file), {
    headers: { "content-type": "video/mp4", "cache-control": "no-store" },
  });
}
