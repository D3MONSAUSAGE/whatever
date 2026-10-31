"use client";


/** The official Pekko "P" (from /workspace/pekko-logo). The white variant is a white silhouette for dark/brand fills. */
export function LogoMark({
  className = "size-12",
  variant = "gradient",
}: {
  className?: string;
  variant?: "gradient" | "white";
}) {
  return (
    <img src="/brand/pekko-p-256.png" alt="" aria-hidden="true" width={256} height={256} draggable={false}
      className={`${className} object-contain select-none`} style={variant === "white" ? { filter: "brightness(0) invert(1)" } : undefined} />
  );
}

export function Wordmark({
  size = "md",
  align = "start",
}: {
  size?: "sm" | "md" | "lg";
  align?: "start" | "center";
}) {
  const title = size === "lg" ? "text-[2rem]" : size === "sm" ? "text-lg" : "text-[1.35rem]";
  const sub = size === "lg" ? "text-[0.7rem] tracking-[0.28em]" : size === "sm" ? "text-[0.55rem] tracking-[0.18em]" : "text-[0.62rem] tracking-[0.22em]";
  return (
    <span className={`inline-flex flex-col leading-none text-ink ${align === "center" ? "items-center" : "items-start"}`}>
      <span className={`font-extrabold tracking-tight ${title}`}>
        Pekko
        <span className="ml-0.5 align-super text-[0.42em] font-bold tracking-normal" aria-hidden="true">TM</span>
      </span>
      <span className={`mt-1 font-semibold uppercase text-ink ${sub}`}>Technologies</span>
    </span>
  );
}

export function BrandLockup({
  size = "md",
  markClassName,
}: {
  size?: "sm" | "md" | "lg";
  markClassName?: string;
}) {
  const mark = markClassName ?? (size === "lg" ? "size-16" : size === "sm" ? "size-9" : "size-11");
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className={mark} />
      <Wordmark size={size} />
    </span>
  );
}

export function WaveBackdrop({
  className = "h-[46%]",
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const back = tone === "dark" ? "rgba(0,102,255,0.42)" : "rgba(0,102,255,0.14)";
  const front = tone === "dark" ? "rgba(0,194,255,0.30)" : "rgba(0,194,255,0.22)";
  return (
    <svg
      className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${className}`}
      viewBox="0 0 1440 360"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path fill={back} d="M0 150C200 70 340 210 560 168C820 118 900 40 1140 96C1280 130 1360 188 1440 156V360H0V150Z" />
      <path fill={front} d="M0 220C240 150 400 292 660 246C940 196 1020 128 1240 176C1340 204 1390 236 1440 214V360H0V220Z" />
    </svg>
  );
}
