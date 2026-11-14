import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { FONT_FILES } from "@/lib/board-fonts";
import { layoutStudioEnabled, layoutStudioPreviewOpen } from "@/lib/layout-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILES = FONT_FILES;

export async function GET(_req: Request, context: { params: Promise<{ name: string }> }) {
  if (!layoutStudioPreviewOpen() && !layoutStudioEnabled()) return new NextResponse("Not found", { status: 404 });
  const { name } = await context.params;
  const file = Object.hasOwn(FILES, name) ? FILES[name] : undefined;
  if (!file) return new NextResponse("Not found", { status: 404 });
  const bytes = readFileSync(join(process.cwd(), "assets", "fonts", file));
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "content-type": "font/ttf", "cache-control": "public, max-age=86400" },
  });
}
