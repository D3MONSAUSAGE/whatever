import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { layoutStudioPreviewOpen } from "@/lib/layout-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILES: Record<string, string> = {
  "noto-serif": "NotoSerif-Regular.ttf",
  "noto-serif-bold": "NotoSerif-Bold.ttf",
  inter: "Inter-Regular.ttf",
  "inter-bold": "Inter-Bold.ttf",
  "inter-extrabold": "Inter-ExtraBold.ttf",
};

export async function GET(_req: Request, context: { params: Promise<{ name: string }> }) {
  if (!layoutStudioPreviewOpen()) return new NextResponse("Not found", { status: 404 });
  const { name } = await context.params;
  const file = FILES[name];
  if (!file) return new NextResponse("Not found", { status: 404 });
  const bytes = readFileSync(join(process.cwd(), "assets", "fonts", file));
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "content-type": "font/ttf", "cache-control": "public, max-age=86400" },
  });
}
