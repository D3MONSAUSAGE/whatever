"use client";

import { useId } from "react";

/** Two stacked rounded diagonal strokes. Same geometry as the favicon SVGs. */
export const SEMPLE_S_TOP = "M47 17.5C35.2 9.2 18.2 12.4 16.6 24.2C15.2 34.2 27.4 39.2 42.6 35.4";
export const SEMPLE_S_BOTTOM = "M22.2 33.2C36.4 28.2 51.6 34.6 48.4 46.8C45.2 59 27.6 61.6 17.2 51.4";

export function LogoMark({
  className = "size-12",
  variant = "gradient",
}: {
  className?: string;
  variant?: "gradient" | "white";
}) {
  const id = `seemple-s-${useId().replace(/:/g, "")}`;
  const stroke = variant === "white" ? "#FFFFFF" : `url(#${id})`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {variant === "gradient" ? (
        <defs>
          <linearGradient id={id} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00C2FF" />
            <stop offset="100%" stopColor="#0066FF" />
          </linearGradient>
        </defs>
      ) : null}
      <path d={SEMPLE_S_TOP} fill="none" stroke={stroke} strokeWidth="9" strokeLinecap="round" />
      <path d={SEMPLE_S_BOTTOM} fill="none" stroke={stroke} strokeWidth="9" strokeLinecap="round" />
    </svg>
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
        Seemple
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
