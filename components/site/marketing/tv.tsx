/**
 * A flat-panel TV around a 16:9 screen. `label` is the accessible description of what is on screen:
 * the board's own text is presentational, so screen readers hear one sentence instead of a whole menu.
 */
export function Tv({ children, label, variant = "stand", className = "", screenClassName = "" }: {
  children: React.ReactNode;
  label: string;
  variant?: "stand" | "wall" | "sm";
  className?: string;
  screenClassName?: string;
}) {
  return (
    <figure className={`mk-tv ${variant === "wall" ? "mk-tv-wall" : variant === "sm" ? "mk-tv-sm" : ""} ${className}`}>
      <div className="mk-tv-body">
        <div className={`mk-tv-screen ${screenClassName}`} role="img" aria-label={label}>{children}</div>
      </div>
      {variant === "stand" ? <div className="mk-tv-stand" aria-hidden="true" /> : null}
    </figure>
  );
}

/** "Sample design" marker shown next to every example board. */
export function SampleNote({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`mk-sample-note ${className}`}>{children}</p>;
}
