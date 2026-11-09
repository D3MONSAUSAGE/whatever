import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PREVIEW_BRANCH = "cursor/layout-studio-audit-0fec";

/** This branch's Vercel preview serves the studio only, so it cannot read or write the production database. */
export function middleware(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== PREVIEW_BRANCH) {
    return NextResponse.next();
  }
  const path = request.nextUrl.pathname;
  const allowed = path === "/layout-studio"
    || path.startsWith("/layout-studio/")
    || path.startsWith("/layout-studio/media/font/")
    || path === "/dev/layout-studio"
    || path.startsWith("/_next/")
    || path === "/favicon.ico";
  if (allowed) return NextResponse.next();
  return new NextResponse("Not found", { status: 404, headers: { "cache-control": "no-store" } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
