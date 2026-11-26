/**
 * The Peek lockup (handoff UPDATE-1): the only logo on the sign-in, create-account, forgot/reset and confirm screens
 * in the Peek preview. Outlined SVG (no font needed), ratio 3.81 : 1, accessible name "Pekko".
 * The marketing site keeps its own logo files in public/brand; nothing there changes.
 */
export function PeekLockup({ height = 64, dark = false, className = "" }: { height?: number; dark?: boolean; className?: string }) {
  return (
    <img src={dark ? "/peek/brand/pekko-lockup-dark.svg" : "/peek/brand/pekko-lockup-light.svg"} alt="Pekko"
      width={Math.round(height * 3.81)} height={height} className={`pk-lockup ${className}`} style={{ height, width: "auto", aspectRatio: "3.81 / 1" }} decoding="async" />
  );
}
