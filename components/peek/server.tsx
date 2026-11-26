import { cookies } from "next/headers";
import { PeekServerProvider } from "@/lib/peek-flag";
import { peekBuildAllowed, peekDefaultOn, peekOptedIn } from "@/lib/peek-gate";

/**
 * Runs before first paint: puts `peek` and `data-theme` on <body> as soon as the browser parses this script, so
 * the page never shows the old design first. Same rules as usePeekBodyClass (lib/peek-flag.ts): ?peek=0 opts out,
 * ?theme= or the cookie picks the theme (light unless dark/system was chosen), Staff keeps the current shell.
 * The hook still runs after hydration and stays the source of truth (it also removes the class on navigation).
 */
const BOOT = `(function(){try{var l=location,s=new URLSearchParams(l.search);if(s.get("peek")==="0"||/^\\/dashboard\\/staff(\\/|$)/.test(l.pathname))return;var b=document.body;b.classList.add("peek");var t=s.get("theme"),m=document.cookie.match(/(?:^|;\\s*)pekko_peek_theme=(dark|light|system)/);var c=t==="dark"||t==="light"||t==="system"?t:m?m[1]:"light";b.dataset.theme=c==="dark"||(c==="system"&&matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light"}catch(e){}})()`;

/**
 * Server half of the Peek flag, used by the sign-in pages and the dashboard layout only. Reads the opt-in cookie (and the
 * build default: on in Production while PEEK_WEB_PRODUCTION=on), so the server HTML already has the Peek markup and
 * there is no flash of the old design. A build with Peek not allowed never reads cookies and renders as before.
 */
export async function PeekServer({ children }: { children: React.ReactNode }) {
  if (!peekBuildAllowed()) return <>{children}</>;
  const jar = await cookies();
  const on = peekOptedIn(jar.toString(), null, peekDefaultOn());
  if (!on) return <>{children}</>;
  return (
    <PeekServerProvider on>
      <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      {children}
    </PeekServerProvider>
  );
}
