import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { canonicalAuthRedirect } from "@/lib/auth-confirm";
import { isLocale, localeCookie, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { localizedPath, marketingBaseOf, parseSpanishPath } from "@/lib/seo";

const PREVIEW_BRANCH = "cursor/layout-studio-audit-0fec";

/** This branch's Vercel preview serves the studio only, so it cannot read or write the production database. */
export function middleware(request: NextRequest) {
  // B2-07A: sign-in pages on the old pantalla-chi alias move to pekkotv.com (307, not cached
  // for good). TV, player and API paths are untouched there; see canonicalAuthRedirect.
  const moved = canonicalAuthRedirect(request.headers.get("host"), request.nextUrl.pathname, request.nextUrl.search);
  if (moved) return NextResponse.redirect(moved, 307);
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === PREVIEW_BRANCH) {
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
  return languageSwitchRedirect(request) ?? spanishMarketingRewrite(request) ?? NextResponse.next();
}

/**
 * The language menu on a marketing page loads `<page>?lang=en|es`. The server saves the choice in the locale
 * cookie and redirects to that page's clean URL in the chosen language (/pricing or /es/pricing). Doing it here,
 * not with document.cookie, avoids a browser race where the next page load could still carry the old language.
 * Legal pages handle their own ?lang and are not matched here.
 */
export function languageSwitchRedirect(request: NextRequest): NextResponse | null {
  const lang = request.nextUrl.searchParams.get("lang");
  if (!isLocale(lang)) return null;
  const base = marketingBaseOf(request.nextUrl.pathname);
  if (!base) return null;
  const url = request.nextUrl.clone();
  url.pathname = localizedPath(base, lang);
  url.searchParams.delete("lang");
  const response = NextResponse.redirect(url, 307);
  response.headers.set("cache-control", "no-store");
  response.headers.append("set-cookie", localeCookie(lang).replace("; Secure", "") + (request.nextUrl.protocol === "https:" ? "; Secure" : ""));
  return response;
}

/**
 * SEO: Spanish marketing pages have their own URLs (/es, /es/features, /es/pricing, /es/faq, /es/support,
 * /es/contact) so search engines can find and index them. The request is rewritten to the English route
 * with the Spanish locale cookie for this render, and the cookie is also set on the response so the
 * visitor keeps Spanish on the next page, exactly as if they had picked Español in the language menu.
 */
export function spanishMarketingRewrite(request: NextRequest): NextResponse | null {
  const match = parseSpanishPath(request.nextUrl.pathname);
  if (!match) return null;
  const url = request.nextUrl.clone();
  url.pathname = match.base;
  const headers = new Headers(request.headers);
  const others = (request.headers.get("cookie") ?? "")
    .split(";").map((c) => c.trim()).filter((c) => c && !c.startsWith(`${LOCALE_COOKIE}=`));
  headers.set("cookie", [...others, `${LOCALE_COOKIE}=es`].join("; "));
  const response = NextResponse.rewrite(url, { request: { headers } });
  // Only a real page load remembers Spanish. Background prefetch/RSC requests for /es links must not, or they
  // could overwrite a language the visitor has just switched to.
  if (!isRouterRequest(request)) {
    response.headers.append("set-cookie", localeCookie("es").replace("; Secure", "") + (request.nextUrl.protocol === "https:" ? "; Secure" : ""));
  }
  return response;
}

function isRouterRequest(request: NextRequest): boolean {
  const h = request.headers;
  return h.has("rsc") || h.has("next-router-prefetch") || h.has("next-router-state-tree") || h.get("purpose") === "prefetch"
    || request.nextUrl.searchParams.has("_rsc");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
