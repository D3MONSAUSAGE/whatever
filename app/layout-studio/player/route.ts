import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { layoutStudioPreviewOpen } from "@/lib/layout-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The existing player script, opened only on the isolated preview path. */
export function GET() {
  if (!layoutStudioPreviewOpen()) return new NextResponse("Not found", { status: 404 });
  const html = readFileSync(join(process.cwd(), "public/player.html"));
  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
