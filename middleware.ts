import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { canonicalAuthRedirect } from "@/lib/auth-confirm";

const PREVIEW_BRANCH = "cursor/layout-studio-audit-0fec";

/** This branch's Vercel preview serves the studio only, so it cannot read or write the production database. */
export function middleware(request: NextRequest) {
  // B2-07A: sign-in pages on the old pantalla-chi alias move to pekkotv.com (307, not cached
  // for good). TV, player and API paths are untouched there; see canonicalAuthRedirect.
  const moved = canonicalAuthRedirect(request.headers.get("host"), request.nextUrl.pathname, request.nextUrl.search);
  if (moved) return NextResponse.redirect(moved, 307);
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
