import { PEEK_LOCKUP } from "@/components/peek/lockup-svg";

type Art = { readonly viewBox: string; readonly inner: string };

function Svg({ art, height, className, label }: { art: Art; height: number; className: string; label: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={art.viewBox} {...(label ? { role: "img", "aria-label": "Pekko" } : { "aria-hidden": true })}
      width={Math.round(height * 3.81)} height={height} className={className} style={{ height, width: "auto", aspectRatio: "3.81 / 1" }}
      dangerouslySetInnerHTML={{ __html: art.inner }} />
  );
}

/**
 * The Peek lockup (handoff UPDATE-1): the only logo on the sign-in, create-account, forgot/reset and confirm screens
 * in the Peek preview. Outlined SVG (no font needed), ratio 3.81 : 1, accessible name "Pekko".
 * Rendered inline (see lockup-svg.ts) so it is part of the server HTML and needs no image request. The light and dark
 * art are both in the markup; CSS shows the one for the current theme (dark stays opt-in).
 * The marketing site keeps its own logo files in public/brand; nothing there changes.
 */
export function PeekLockup({ height = 64, dark = false, className = "" }: { height?: number; dark?: boolean; className?: string }) {
  if (dark) return <Svg art={PEEK_LOCKUP.dark} height={height} className={`pk-lockup ${className}`} label />;
  return (
    <span className="pk-lockup-pair">
      <Svg art={PEEK_LOCKUP.light} height={height} className={`pk-lockup pk-lockup-light ${className}`} label />
      <Svg art={PEEK_LOCKUP.dark} height={height} className={`pk-lockup pk-lockup-dark ${className}`} label={false} />
    </span>
  );
}
